import * as MetabaseError from "embedding-sdk/errors";
import type { MetabaseAuthMethod } from "embedding-sdk/types";

export async function connectToInstanceAuthSso(
  url: string,
  {
    headers,
    preferredAuthMethod,
  }: {
    headers?: Record<string, string>;
    preferredAuthMethod?: MetabaseAuthMethod;
  } = {},
) {
  if (
    preferredAuthMethod &&
    preferredAuthMethod !== "jwt" &&
    preferredAuthMethod !== "saml"
  ) {
    throw MetabaseError.INVALID_AUTH_METHOD({
      method: preferredAuthMethod,
    });
  }

  const ssoUrl = new URL("/auth/sso", url);

  if (preferredAuthMethod) {
    ssoUrl.searchParams.set("preferred_method", preferredAuthMethod);
  }

  try {
    const urlResponse = await fetch(ssoUrl, { headers });
    if (!urlResponse.ok) {
      throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
        instanceUrl: url,
        status: urlResponse.status,
      });
    }
    return await urlResponse.json();
  } catch (e) {
    // If the error is already a MetabaseError, just rethrow
    if (e instanceof MetabaseError.MetabaseError) {
      throw e;
    }
    throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
      instanceUrl: url,
      status: (e as any)?.status,
    });
  }
}
