import type { GetRefreshTokenFn } from "embedding-sdk/store/types";

/**
 * The default implementation of the function to get the refresh token.
 * Only supports sessions by default.
 */
export const defaultGetRefreshTokenFn: GetRefreshTokenFn = async url => {
  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  return await response.json();
};
