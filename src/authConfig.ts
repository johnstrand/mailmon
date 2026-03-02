import type { Configuration } from '@azure/msal-browser';
import { PublicClientApplication } from '@azure/msal-browser';

export const msalConfig: Configuration = {
  auth: {
    clientId: 'a2188c90-5fe8-4fbe-9b81-5a8b25fbc311',
    authority: 'https://login.microsoftonline.com/119b093f-c16c-48eb-9198-47a87994423b',
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: 'sessionStorage',
  },
};

export const loginRequest = {
  scopes: ['Mail.ReadWrite', 'Tasks.ReadWrite'],
};

export const msalInstance = new PublicClientApplication(msalConfig);
