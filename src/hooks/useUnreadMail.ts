import { useState, useEffect, useCallback, useRef } from 'react';
import { useMsal } from '@azure/msal-react';
import type { Client } from '@microsoft/microsoft-graph-client';
import { getGraphClient, getAccessToken } from '../graphClient';
import { graphBatch } from '../graphBatch';
import { withRetry } from '../utils/retry';
import type { MailMessage } from '../types/mail';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const MAIL_FIELDS = 'id,subject,bodyPreview,body,from,receivedDateTime,isRead,conversationId';

interface FolderInfo {
  id: string;
  displayName: string;
}

/** Recursively collect the Inbox folder and all descendant folders (sequential, not parallel). */
async function getAllInboxFolders(client: Client): Promise<FolderInfo[]> {
  const folders: FolderInfo[] = [];

  async function fetchChildren(folderId: string) {
    const response = await client
      .api(`/me/mailFolders/${folderId}/childFolders`)
      .top(100)
      .get();
    const children: { id: string; displayName: string; childFolderCount: number }[] =
      response.value ?? [];
    // Sequential to avoid burst
    for (const folder of children) {
      folders.push({ id: folder.id, displayName: folder.displayName });
      if (folder.childFolderCount > 0) {
        await fetchChildren(folder.id);
      }
    }
  }

  const inbox = await client.api('/me/mailFolders/inbox').get();
  folders.push({ id: inbox.id, displayName: inbox.displayName });
  if (inbox.childFolderCount > 0) {
    await fetchChildren(inbox.id);
  }

  return folders;
}

/** Fetch unread messages from all folders using the $batch endpoint. */
async function batchFetchUnreadMessages(
  accessToken: string,
  folders: FolderInfo[],
  mailbox: string,
): Promise<MailMessage[]> {
  const params = new URLSearchParams({
    '$filter': 'isRead eq false',
    '$select': MAIL_FIELDS,
    '$orderby': 'receivedDateTime DESC',
    '$top': '100',
  });

  const requests = folders.map((f, i) => ({
    id: String(i),
    method: 'GET' as const,
    url: `/me/mailFolders/${f.id}/messages?${params.toString()}`,
  }));

  const responseMap = await graphBatch(accessToken, requests);
  const messages: MailMessage[] = [];

  folders.forEach((folder, i) => {
    const res = responseMap.get(String(i));
    if (res && res.status === 200) {
      const items = (res.body as { value?: MailMessage[] })?.value ?? [];
      items.forEach((m) => messages.push({ ...m, mailbox, folderName: folder.displayName }));
    }
  });

  return messages;
}

export function useUnreadMail() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());

  const fetchMail = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setError(null);
    try {
      await withRetry(async () => {
        const [client, accessToken] = await Promise.all([
          getGraphClient(instance, account),
          getAccessToken(instance, account),
        ]);
        const allFolders = await getAllInboxFolders(client);
        const all = await batchFetchUnreadMessages(accessToken, allFolders, account.username);
        all.sort(
          (a, b) =>
            new Date(b.receivedDateTime).getTime() - new Date(a.receivedDateTime).getTime(),
        );
        setMessages(all);
        setFolders(allFolders.map((f) => f.displayName).sort());
        setLastRefreshed(new Date());
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch mail');
    } finally {
      setLoading(false);
    }
  }, [instance, account]);

  // Initial fetch + polling
  useEffect(() => {
    fetchMail();
    const timer = setInterval(fetchMail, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [fetchMail]);

  const markAsRead = useCallback(
    async (messageId: string) => {
      if (!account) return;
      setMarkingIds((prev) => new Set(prev).add(messageId));
      try {
        await withRetry(() =>
          getGraphClient(instance, account)
            .api(`/me/messages/${messageId}`)
            .patch({ isRead: true }),
        );
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark as read');
      } finally {
        setMarkingIds((prev) => { const s = new Set(prev); s.delete(messageId); return s; });
      }
    },
    [instance, account],
  );

  const markManyAsRead = useCallback(
    async (messageIds: string[]) => {
      if (!account || messageIds.length === 0) return;
      setMarkingIds((prev) => { const s = new Set(prev); messageIds.forEach((id) => s.add(id)); return s; });
      try {
        const accessToken = await getAccessToken(instance, account);
        const requests = messageIds.map((id, i) => ({
          id: String(i),
          method: 'PATCH' as const,
          url: `/me/messages/${id}`,
          body: { isRead: true },
        }));
        await withRetry(() => graphBatch(accessToken, requests));
        setMessages((prev) => prev.filter((m) => !messageIds.includes(m.id)));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to mark as read');
      } finally {
        setMarkingIds((prev) => { const s = new Set(prev); messageIds.forEach((id) => s.delete(id)); return s; });
      }
    },
    [instance, account],
  );

  const refetchRef = useRef(fetchMail);
  useEffect(() => {
    refetchRef.current = fetchMail;
  }, [fetchMail]);

  return {
    messages,
    folders,
    loading,
    error,
    lastRefreshed,
    markingIds,
    refetch: fetchMail,
    markAsRead,
    markManyAsRead,
  };
}


