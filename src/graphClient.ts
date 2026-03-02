import { Client } from '@microsoft/microsoft-graph-client';
import type { AuthenticationProvider } from '@microsoft/microsoft-graph-client';
import type { IPublicClientApplication, AccountInfo } from '@azure/msal-browser';
import { loginRequest } from './authConfig';

function createAuthProvider(
  msalInstance: IPublicClientApplication,
  account: AccountInfo,
): AuthenticationProvider {
  return {
    getAccessToken: async () => {
      const response = await msalInstance.acquireTokenSilent({
        ...loginRequest,
        account,
      });
      return response.accessToken;
    },
  };
}

export function getGraphClient(
  msalInstance: IPublicClientApplication,
  account: AccountInfo,
): Client {
  return Client.initWithMiddleware({
    authProvider: createAuthProvider(msalInstance, account),
  });
}

export async function getAccessToken(
  msalInstance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  const response = await msalInstance.acquireTokenSilent({
    ...loginRequest,
    account,
  });
  return response.accessToken;
}
