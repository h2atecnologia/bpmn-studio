import queryString from 'querystring';
import fetch from 'node-fetch';
import nodeUrl from 'url';
import {BrowserWindowConstructorOptions, Event as ElectronEvent} from 'electron';
import crypto from 'crypto';

import {IOidcConfig, ITokenObject} from '../src/contracts/index';

// TODO Check if this is really necessary
// eslint-disable-next-line @typescript-eslint/no-require-imports
import electron = require('electron');

const BrowserWindow = electron.BrowserWindow || electron.remote.BrowserWindow;

export default (
  config: IOidcConfig,
  windowParams: BrowserWindowConstructorOptions,
): {
  getTokenObject: (authorityUrl: string) => Promise<ITokenObject>;
  logout: (tokenObject: ITokenObject, authorityUrl: string) => Promise<boolean>;
} => {
  function getTokenObjectForAuthorityUrl(authorityUrl): Promise<any> {
    return getTokenObject(authorityUrl, config, windowParams);
  }

  function logoutViaTokenObjectAndAuthorityUrl(tokenObject: ITokenObject, authorityUrl: string): Promise<boolean> {
    return logout(tokenObject, authorityUrl, config, windowParams);
  }

  return {
    getTokenObject: getTokenObjectForAuthorityUrl,
    logout: logoutViaTokenObjectAndAuthorityUrl,
  };
};

function getTokenObject(
  authorityUrl: string,
  config: IOidcConfig,
  windowParams: BrowserWindowConstructorOptions,
): Promise<{
  idToken: string;
  accessToken: string;
}> {
  // Build the Url Params from the Config.
  const urlParams = {
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: config.responseType,
    scope: config.scope,
    state: getRandomString(16),
    nonce: getRandomString(16),
  };

  const urlToLoad: string = `${authorityUrl}connect/authorize?${queryString.stringify(urlParams)}`;

  return new Promise((resolve: Function, reject: Function): void => {
    // Open a new browser window and load the previously constructed url.
    const authWindow = new BrowserWindow(windowParams || {useContentSize: true});

    authWindow.loadURL(urlToLoad);
    authWindow.show();

    // Reject the Promise when the user closes the new window.
    authWindow.on('closed', (): void => {
      reject(new Error('window was closed by user'));
    });

    /**
     * This will trigger everytime the new window will redirect.
     * Important: Not AFTER it redirects but BEFORE.
     * This gives us the possibility to intercept the redirect to
     * the specified redirect uri, which would lead to faulty behaviour
     * due to security aspects in chromium.
     *
     * If that redirect would start we stop it by preventing the default
     * behaviour and instead parse its parameters in the
     * "onCallback"-function.
     */
    authWindow.webContents.on('will-redirect', (event: ElectronEvent, url: string): void => {
      if (url.includes(config.redirectUri)) {
        event.preventDefault();
      }

      redirectCallback(url, authWindow, config, resolve, reject);
    });
  });
}

// Handle the different callbacks.
function redirectCallback(
  url: string,
  authWindow: electron.BrowserWindow,
  config: IOidcConfig,
  resolve: Function,
  reject: Function,
): void {
  // Parse callback url into its parts.
  const urlParts = nodeUrl.parse(url, true);
  const href = urlParts.href;

  /**
   * If there was an error:
   * - Reject the promise with the error.
   * - Close the window.
   *
   * If the href includes the callback uri:
   * - Load that href in the window.
   *
   * If the href includes the specified redirect uri:
   * - Parse the hash into its parts.
   * - Add those parts to new object.
   * - Resolve the promise with this object.
   * - Close the window.
   */
  if (href === null) {
    reject(`Could not parse url: ${url}`);

    authWindow.removeAllListeners('closed');

    setImmediate(() => {
      authWindow.close();
    });
  } else if (href.includes('/connect/authorize/callback')) {
    authWindow.loadURL(href);
  } else if (href.includes(config.redirectUri)) {
    const identityParameter = urlParts.hash;
    const parameterAsArray = identityParameter.split('&');

    const idToken = parameterAsArray[0].split('=')[1];
    const accessToken = parameterAsArray[1].split('=')[1];

    const tokenObject = {
      idToken,
      accessToken,
    };

    resolve(tokenObject);
    authWindow.removeAllListeners('closed');

    setImmediate(() => {
      authWindow.close();
    });
  }
}

function logout(
  tokenObject: ITokenObject,
  authorityUrl: string,
  config: IOidcConfig,
  windowParams: BrowserWindowConstructorOptions,
): Promise<boolean> {
  const urlParams = {
    id_token_hint: tokenObject.userId,
    post_logout_redirect_uri: config.logoutRedirectUri,
  };

  const endSessionUrl = `${authorityUrl}connect/endsession?${queryString.stringify(urlParams)}`;

  return new Promise(
    async (resolve: Function): Promise<void> => {
      const response: fetch.Response = await fetch(endSessionUrl);

      const logoutWindow = new BrowserWindow(windowParams || {useContentSize: true});

      logoutWindow.webContents.on('will-navigate', (event, url) => {
        if (url.includes(config.logoutRedirectUri)) {
          event.preventDefault();
          resolve(true);
          logoutWindow.close();
        }
      });

      logoutWindow.on('closed', () => {
        resolve(true);
      });

      logoutWindow.loadURL(response.url);
      logoutWindow.show();
    },
  );
}

function getRandomString(length: number): string {
  const charset: string = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._~';
  let result: string = '';

  while (length > 0) {
    const randomValues: Buffer = crypto.randomBytes(length);

    // eslint-disable-next-line no-loop-func
    randomValues.forEach((value: number) => {
      if (length === 0) {
        return;
      }

      if (value < charset.length) {
        result += charset[value];
        length--;
      }
    });
  }

  return result;
}
