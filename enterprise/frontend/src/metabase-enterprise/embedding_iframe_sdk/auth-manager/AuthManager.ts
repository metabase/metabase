import {
  connectToInstanceAuthSso,
  jwtDefaultRefreshTokenFunction,
  openSamlLoginPopup,
  validateSession,
} from "embedding/auth-common";
import {
  INVALID_AUTH_METHOD,
  MetabaseError,
} from "embedding-sdk-bundle/errors";
import type { EmbedAuthManagerContext } from "metabase/embedding/embedding-iframe-sdk/types/auth-manager";
import type { MetabaseEmbeddingSessionToken } from "metabase/embedding-sdk/types/refresh-token";

/**
 * Manages authentication for embedded Metabase components.
 * Handles SSO authentication via SAML or JWT methods.
 */
export class EmbedAuthManager {
  constructor(private context: EmbedAuthManagerContext) {}

  /**
   * Authenticate the user and send the session token to the iframe.
   * If using an API key, authentication is skipped.
   */
  async authenticate(): Promise<void> {
    // If we are using an API key, we don't need to authenticate via SSO.
    if (this.context.properties.apiKey) {
      return;
    }

    try {
      const { method, sessionToken } = await this.getMetabaseSessionToken();
      validateSession(sessionToken);

      if (sessionToken) {
        this.context.sendMessage("metabase.embed.submitSessionToken", {
          authMethod: method,
          sessionToken,
        });
      }
    } catch (error) {
      // if the error is an authentication error, show it to the iframe too
      if (error instanceof MetabaseError) {
        this.context.sendMessage("metabase.embed.reportAuthenticationError", {
          error,
        });
      }
    }
  }

  private async getMetabaseSessionToken(): Promise<{
    method: "saml" | "jwt";
    sessionToken: MetabaseEmbeddingSessionToken;
  }> {
    const { instanceUrl, preferredAuthMethod, fetchRequestToken } =
      this.context.properties;

    const urlResponseJson = await connectToInstanceAuthSso(instanceUrl, {
      headers: this.getAuthRequestHeader(),
      preferredAuthMethod,
    });

    const { method, url: responseUrl, hash } = urlResponseJson || {};

    if (method === "saml") {
      const sessionToken = await openSamlLoginPopup(responseUrl);

      return { method, sessionToken };
    }

    if (method === "jwt") {
      const sessionToken = await jwtDefaultRefreshTokenFunction(
        responseUrl,
        instanceUrl,
        this.getAuthRequestHeader(hash),
        fetchRequestToken,
      );

      return { method, sessionToken };
    }

    throw INVALID_AUTH_METHOD({ method });
  }

  private getAuthRequestHeader(hash?: string) {
    return {
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
      "X-Metabase-Client": "embedding-simple",

      // eslint-disable-next-line metabase/no-literal-metabase-strings -- header name
      ...(hash && { "X-Metabase-SDK-JWT-Hash": hash }),
    };
  }
}
