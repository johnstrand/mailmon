import { useState, useEffect } from 'react';
import { useMsal } from '@azure/msal-react';
import { getGraphClient } from '../graphClient';

export interface TodoList {
  id: string;
  displayName: string;
}

export function useTodoLists() {
  const { instance, accounts } = useMsal();
  const account = accounts[0];

  const [lists, setLists] = useState<TodoList[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!account) return;
    setLoading(true);
    setError(null);
    const client = getGraphClient(instance, account);
    client
      .api('/me/todo/lists')
      .get()
      .then((res) => setLists(res.value ?? []))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load lists'))
      .finally(() => setLoading(false));
  }, [instance, account]);

  return { lists, loading, error };
}
