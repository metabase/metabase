import * as MetabaseError from "embedding-sdk-bundle/errors";

export function validateSession(session: any) {
  if (!session || typeof session !== "object") {
    throw MetabaseError.INVALID_SESSION_OBJECT({
      expected: "{ jwt: string }",
      actual: JSON.stringify(session, null, 2),
    });
  }

  if ("status" in session && session.status !== "ok") {
    if ("message" in session && typeof session.message === "string") {
      throw MetabaseError.INVALID_SESSION_OBJECT({
        expected: "{ jwt: string }",
        actual: session.message,
      });
    }

    if (typeof session.status === "string") {
      throw MetabaseError.INVALID_SESSION_OBJECT({
        expected: "{ jwt: string }",
        actual: session.status,
      });
    }
  }

  // We should also receive `iat` and `status` in the response, but we don't actually need them
  // as we don't use them, so we don't throw an error if they are missing

  /**
   * (EMB-829) Temporarily allow `exp` to be null or undefined while we're deprecating token without it
   * after we disallow token without expiration, we will re-add this check.
   */
  if (typeof session.id !== "string") {
    throw MetabaseError.INVALID_SESSION_SCHEMA({
      expected: "{ id: string, exp: number, iat: number }",
      actual: JSON.stringify(session, null, 2),
    });
  }
}
