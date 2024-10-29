import type {
  EmbeddingSessionToken,
  FetchRequestTokenFn,
  SDKConfig,
} from "embedding-sdk";
import { setupSdkAuth } from "embedding-sdk/hooks";
import { COULD_NOT_AUTHENTICATE_MESSAGE } from "embedding-sdk/lib/user-warnings";
import type { SdkDispatch, SdkStoreState } from "embedding-sdk/store/types";
import { createAsyncThunk } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";

import { getOrRefreshSession, setLoginStatus } from "./reducer";
import { getFetchRefreshTokenFn } from "./selectors";

export const initAuth = createAsyncThunk(
  "sdk/token/INIT_AUTH",
  async (sdkConfig: SDKConfig, { dispatch }) => {
    setupSdkAuth(sdkConfig, dispatch as SdkDispatch);

    dispatch(setLoginStatus({ status: "loading" }));

    try {
      // if using JWT, let's first check if the session is valid before doing other requests
      // mostly to have better errors and debugging information
      if (sdkConfig.jwtProviderUri) {
        const sessionResponse = await dispatch(
          getOrRefreshSession(sdkConfig.jwtProviderUri),
        );
        if (sessionResponse.meta.requestStatus === "rejected") {
          // errors on `getOrRefreshSession` are handled directly in the reducer
          return;
        }
      }

      const [userResponse, siteSettingsResponse] = await Promise.all([
        dispatch(refreshCurrentUser()),
        dispatch(refreshSiteSettings({})),
      ]);

      if (
        userResponse.meta.requestStatus === "rejected" ||
        siteSettingsResponse.meta.requestStatus === "rejected"
      ) {
        dispatch(
          setLoginStatus({
            status: "error",
            error: new Error(COULD_NOT_AUTHENTICATE_MESSAGE),
          }),
        );
        return;
      }

      dispatch(setLoginStatus({ status: "success" }));
    } catch (error) {
      dispatch(
        setLoginStatus({
          status: "error",
          error: new Error(COULD_NOT_AUTHENTICATE_MESSAGE),
        }),
      );
    }
  },
);

export const refreshTokenAsync = createAsyncThunk(
  "sdk/token/REFRESH_TOKEN",
  async (url: string, { getState }): Promise<EmbeddingSessionToken | null> => {
    // The SDK user can provide a custom function to refresh the token.
    const customGetRefreshToken = getFetchRefreshTokenFn(
      getState() as SdkStoreState,
    );

    const getRefreshToken = customGetRefreshToken ?? defaultGetRefreshTokenFn;

    // # How does the error handling work?
    // This is an async thunk, thunks _by design_ can fail and no error will be shown on the console (it's the reducer that should handle the reject action)
    // The following lines are wrapped in a try/catch block that will catch any errors thrown, log them to the console as a big red errors, and re-throw them to make the thunk reject
    // In this way we also support standard thrown Errors in the custom fetchRequestToken user provided function

    try {
      const response = await getRefreshToken(url);

      if (!response || typeof response !== "object") {
        const source = customGetRefreshToken
          ? '"fetchRequestToken"'
          : "jwtProvider endpoint";

        throw new Error(
          `The ${source} must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(response)} instead`,
        );
      }
      if ("status" in response && response.status !== "ok") {
        if ("message" in response && typeof response.message === "string") {
          // For some errors, the BE gives us a message that explains it
          throw new Error(response.message);
        }
        if ("status" in response && typeof response.status === "string") {
          // other times it just returns an error code
          throw new Error(
            `Failed to refresh token, got status: ${response.status}`,
          );
        }
      }
      // Lastly if we don't have an error message or status check if we actually got the session id
      if (!("id" in response)) {
        throw new Error(
          `"fetchRequestToken" must return an object with the shape {id:string, exp:number, iat:number, status:string}, got ${safeStringify(response)} instead`,
        );
      }
      return response;
    } catch (ex: unknown) {
      if (ex instanceof Error) {
        Error.captureStackTrace(ex, refreshTokenAsync);
      }

      // The host app may have a lot of logs (and the sdk logs a lot too), so we
      // make a big red error message to make it visible as this is 90% a blocking error
      console.error(
        "%cFailed to refresh auth session\n",
        "color: #FF2222; font-size: 16px; font-weight: bold;",
        ex,
      );

      throw ex;
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

/**
 * The default implementation of the function to get the refresh token.
 * Only supports sessions by default.
 */
export const defaultGetRefreshTokenFn: FetchRequestTokenFn = async url => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const asText = await response.text();

  try {
    return JSON.parse(asText);
  } catch (ex) {
    return asText;
  }
};
