/**
 * Auth-token sub-protocol between embed.js and the sdk bundle.
 *
 * Only messages the bundle itself exchanges with embed.js at runtime belong
 * here. The rest of the postMessage protocol lives in the eajs-shared
 * contract (script/types/embed.ts).
 */
import type { MetabaseError } from "embedding-sdk-shared/errors";
import type { MetabaseErrorCode } from "embedding-sdk-shared/errors/error-code";
import type { MetabaseAuthMethod } from "embedding-sdk-shared/types/auth-config";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

export type SdkIframeEmbedTagRequestSessionTokenMessage = {
  type: "metabase.embed.requestSessionToken";
};

export type SdkIframeEmbedTagRequestGuestTokenRefreshMessage = {
  type: "metabase.embed.requestGuestTokenRefresh";
  data: {
    expiredToken: string;
  };
};

export type SdkIframeEmbedSubmitSessionTokenMessage = {
  type: "metabase.embed.submitSessionToken";
  data: {
    authMethod: MetabaseAuthMethod;
    sessionToken: MetabaseEmbeddingSessionToken;
  };
};

export type SdkIframeEmbedReportAuthenticationError = {
  type: "metabase.embed.reportAuthenticationError";
  data: {
    error: MetabaseError<MetabaseErrorCode, unknown>;
  };
};

export type SdkIframeEmbedSubmitRefreshedGuestTokenMessage = {
  type: "metabase.embed.submitRefreshedGuestToken";
  data: {
    guestToken: string;
  };
};

/** Responses embed.js sends back during the auth flows. */
export type SdkIframeEmbedAuthResponseMessage =
  | SdkIframeEmbedSubmitSessionTokenMessage
  | SdkIframeEmbedReportAuthenticationError
  | SdkIframeEmbedSubmitRefreshedGuestTokenMessage;
