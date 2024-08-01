import type { FetchRequestTokenFn } from "embedding-sdk";

/**
 * The default implementation of the function to get the refresh token.
 * Only supports sessions by default.
 */
export const defaultGetRefreshTokenFn: FetchRequestTokenFn = async url => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  return response.json();
};
