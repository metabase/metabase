import * as MetabaseError from "embedding-sdk-bundle/errors";

export function validateSessionToken(token: any) {
  if (!token || typeof token !== "object") {
    throw MetabaseError.INVALID_SESSION_OBJECT({
      expected: "{ jwt: string }",
      actual: JSON.stringify(token, null, 2),
    });
  }

  if ("status" in token && token.status !== "ok") {
    if ("message" in token && typeof token.message === "string") {
      throw MetabaseError.INVALID_SESSION_OBJECT({
        expected: "{ jwt: string }",
        actual: token.message,
      });
    }

    if (typeof token.status === "string") {
      throw MetabaseError.INVALID_SESSION_OBJECT({
        expected: "{ jwt: string }",
        actual: token.status,
      });
    }
  }

  // We should also receive `iat` and `status` in the response, but we don't actually need them
  // as we don't use them, so we don't throw an error if they are missing

  /**
   * (EMB-829) Temporarily allow `exp` to be null or undefined while we're deprecating token without it
   * after we disallow token without expiration, we will re-add this check.
   */
  if (typeof token.id !== "string") {
    throw MetabaseError.INVALID_SESSION_SCHEMA({
      expected: "{ id: string, exp: number, iat: number }",
      actual: JSON.stringify(token, null, 2),
    });
  }
}

export function shouldRefreshToken(token?: any) {
  return (
    !token || (typeof token?.exp === "number" && token.exp * 1000 < Date.now())
  );
}
