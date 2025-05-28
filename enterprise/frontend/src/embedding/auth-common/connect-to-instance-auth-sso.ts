import * as MetabaseError from "embedding-sdk/errors";

export async function connectToInstanceAuthSso(
  url: string,
  headers: Record<string, string>,
) {
  try {
    const urlResponse = await fetch(`${url}/auth/sso`, { headers });
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
