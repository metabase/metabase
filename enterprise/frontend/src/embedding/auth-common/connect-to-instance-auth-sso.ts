import * as MetabaseError from "embedding-sdk-shared/errors";
import type { MetabaseAuthMethod } from "embedding-sdk-shared/types/auth-config";

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

  const ssoUrl = new URL(`${url}/auth/sso`);

  if (preferredAuthMethod) {
    ssoUrl.searchParams.set("preferred_method", preferredAuthMethod);
  }

  try {
    const urlResponse = await fetch(ssoUrl, { headers });

    if (!urlResponse.ok) {
      let errorData;

      try {
        errorData = await urlResponse.json();
      } catch {}

      throw MetabaseError.CANNOT_CONNECT_TO_INSTANCE({
        instanceUrl: url,
        status: urlResponse.status,
        message: errorData?.message,
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
      // Unjustified type cast. FIXME
      status: (e as any)?.status,
    });
  }
}
