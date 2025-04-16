import * as Yup from "yup";

import type {
  MetabaseAuthConfig,
  MetabaseEmbeddingSessionToken,
} from "embedding-sdk";
import { getEmbeddingSdkVersion } from "embedding-sdk/config";
import { getIsLocalhost } from "embedding-sdk/lib/is-localhost";
import { bigErrorHeader, bigWarningHeader } from "embedding-sdk/lib/log-utils";
import { isSdkVersionCompatibleWithMetabaseVersion } from "embedding-sdk/lib/version-utils";
import type { SdkStoreState } from "embedding-sdk/store/types";
import api from "metabase/lib/api";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import type { Settings } from "metabase-types/api";

import { getOrRefreshSession } from "./reducer";
import { getAuthInterface, getFetchRefreshTokenFn } from "./selectors";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (authConfig: MetabaseAuthConfig, { dispatch }) => {
    // Setup JWT or API key
    const isValidAuthProviderUri =
      authConfig.authProviderUri && authConfig.authProviderUri?.length > 0;
    const isValidApiKeyConfig = authConfig.apiKey && getIsLocalhost();

    if (isValidAuthProviderUri) {
      // JWT setup
      api.onBeforeRequest = async () => {
        const session = await dispatch(
          getOrRefreshSession(authConfig.authProviderUri!),
        ).unwrap();
        if (session?.id) {
          api.sessionToken = session.id;
        }
      };
      // verify that the session is actually valid before proceeding
      await dispatch(getOrRefreshSession(authConfig.authProviderUri!)).unwrap();
    } else if (isValidApiKeyConfig) {
      // API key setup
      api.apiKey = authConfig.apiKey;
    }
    // Fetch user and site settings
    const [user, siteSettings] = await Promise.all([
      dispatch(refreshCurrentUser()),
      dispatch(refreshSiteSettings()),
    ]);

    const mbVersion = (siteSettings.payload as Settings)?.version?.tag;
    const sdkVersion = getEmbeddingSdkVersion();

    if (mbVersion && sdkVersion !== "unknown") {
      if (
        !isSdkVersionCompatibleWithMetabaseVersion({
          mbVersion,
          sdkVersion,
        })
      ) {
        console.warn(
          ...bigWarningHeader("Detected SDK compatibility issue"),
          `SDK version ${sdkVersion} is not compatible with MB version ${mbVersion}, this might cause issues.`,
          // eslint-disable-next-line no-unconditional-metabase-links-render -- console log in case of issues
          "Learn more at https://www.metabase.com/docs/latest/embedding/sdk/version",
        );
      }
    }

    if (!user.payload) {
      // The refresh user thunk just returns null if it fails to fetch the user, it doesn't throw
      const error = new Error(
        "Failed to fetch the user, the session might be invalid.",
      );
      console.error(error);
      throw error;
    }
    if (!siteSettings.payload) {
      const error = new Error(
        "Failed to fetch the site settings, the session might be invalid.",
      );
      console.error(error);
      throw error;
    }
  },
);

export const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (
    url: string,
    { getState },
  ): Promise<MetabaseEmbeddingSessionToken | null> => {
    // The SDK user can provide a custom function to refresh the token.
    const customGetRefreshToken = getFetchRefreshTokenFn(
      getState() as SdkStoreState,
    );

    const authInterface = getAuthInterface(getState() as SdkStoreState)

    const getRefreshToken = customGetRefreshToken ?? getRefreshFunction({ authInterface });

    // # How does the error handling work?
    // This is an async thunk, thunks _by design_ can fail and no error will be shown on the console (it's the reducer that should handle the reject action)
    // The following lines are wrapped in a try/catch block that will catch any errors thrown, log them to the console as a big red errors, and re-throw them to make the thunk reject
    // In this way we also support standard thrown Errors in the custom fetchRequestToken user provided function

    try {
      const session = await getRefreshToken(url);
      const source = customGetRefreshToken
        ? '"fetchRequestToken"'
        : "authProviderUri endpoint";

      if (!session || typeof session !== "object") {
        throw new Error(
          `The ${source} must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(session)} instead`,
        );
      }
      if ("status" in session && session.status !== "ok") {
        if ("message" in session && typeof session.message === "string") {
          // For some errors, the BE gives us a message that explains it
          throw new Error(session.message);
        }
        if (typeof session.status === "string") {
          // other times it just returns an error code
          throw new Error(
            `Failed to refresh token, got status: ${session.status}`,
          );
        }
      }
      // Lastly if we don't have an error message or status, check if we actually got the session ID and expiration
      if (!sessionSchema.isValidSync(session)) {
        throw new Error(
          `The ${source} must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(session)} instead`,
        );
      }
      return session;
    } catch (exception: unknown) {
      // The host app may have a lot of logs (and the sdk logs a lot too), so we
      // make a big red error message to make it visible as this is 90% a blocking error
      console.error(...bigErrorHeader("Failed to get auth session"), exception);

      throw exception;
    }
  },
);

const safeStringify = (value: unknown) => {
  try {
    return JSON.stringify(value);
  } catch (e) {
    return value;
  }
};

export const getRefreshFunction = ({ authInterface }: Pick<SdkStoreState['sdk'], "authInterface">) => {
  console.log({ authInterface })
  if (authInterface === "popup") {
    return popupRefreshTokenFn
  }

  return silentIframeRefreshFunction

}


export const silentIframeRefreshFunction = async (url: string): Promise<MetabaseEmbeddingSessionToken> => {
  // This function is only for token refreshes where the user is already authenticated
  return new Promise((resolve, reject) => {
    // Add parameters to indicate this is a token refresh
    const tokenUrl = url.includes("?")
      ? `${url}&token=true&origin=${encodeURIComponent(window.location.origin)}&refresh=true`
      : `${url}?token=true&origin=${encodeURIComponent(window.location.origin)}&refresh=true`;

    // Open a minimal popup window for token refresh
    // Make it tiny and position in corner to minimize visibility
    const width = 1;
    const height = 1;
    const left = window.screen.width - width;
    const top = 0;

    const authWindow = window.open(
      tokenUrl,
      "samlRefresh",
      `width=${width},height=${height},left=${left},top=${top},resizable=no,status=no,location=no,toolbar=no,menubar=no`
    );

    if (!authWindow) {
      reject(new Error("Auth window was blocked. Please allow popups for this site."));
      return;
    }

    // Listen for message from auth window
    const messageHandler = (event: MessageEvent) => {
      // Only accept messages with the correct type
      if (event.data?.type === 'SAML_AUTH_COMPLETE' && event.data.authData) {
        // Remove event listener
        window.removeEventListener('message', messageHandler);

        // Make sure window is closed
        if (!authWindow.closed) {
          authWindow.close();
        }

        // Resolve with auth data
        resolve(event.data.authData);
      }
    };

    window.addEventListener('message', messageHandler);

    // Set timeout to prevent hanging indefinitely
    const timeoutId = setTimeout(() => {
      window.removeEventListener('message', messageHandler);

      if (!authWindow.closed) {
        authWindow.close();
      }

      reject(new Error("Authentication timed out"));
    }, 30000); // 30 second timeout
  });
};

export const popupRefreshTokenFn = async (url: string) => {
  // For SAML authentication, use a popup approach
  return new Promise((resolve, reject) => {
    // Define popup dimensions
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Just use the token=true parameter to get the HTML response
    const tokenUrl = url.includes("?")
      ? `${url}&token=true&popup=true`
      : `${url}?token=true&popup=true`;

    // Open popup
    const popup = window.open(
      tokenUrl,
      "samlLoginPopup",
      `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,status=yes`,
    );

    if (!popup) {
      reject(new Error("Popup blocked. Please allow popups for this site."));
      return;
    }

    // Listen for message from the popup
    const messageHandler = (event: MessageEvent) => {
      // Security check - only accept messages from our popup
      if (event.source !== popup) {
        return;
      }

      // Check for our specific message type
      if (event.data && event.data.type === "saml_auth_complete") {
        // Remove the event listener
        window.removeEventListener("message", messageHandler);

        // Close the popup
        popup.close();

        // Resolve with the auth data
        resolve(event.data.payload);
      }
    };

    window.addEventListener("message", messageHandler);

    // Handle popup closing
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        clearInterval(checkClosed);
        window.removeEventListener("message", messageHandler);
        reject(new Error("Authentication was canceled"));
      }
    }, 1000);

    // Set timeout to prevent hanging indefinitely
    setTimeout(() => {
      clearInterval(checkClosed);
      window.removeEventListener("message", messageHandler);
      if (!popup.closed) {
        popup.close();
      }
      reject(new Error("Authentication timed out"));
    }, 300000); // 5 minutes timeout
  });
};

const sessionSchema = Yup.object({
  id: Yup.string().required(),
  exp: Yup.number().required(),
  // We should also receive `iat` and `status` in the response, but we don't actually need them
  // as we don't use them, so we don't throw an error if they are missing
});
