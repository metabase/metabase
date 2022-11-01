/* eslint-disable */
import { TokenResponse } from "./types";

/**
 * Checks if the user granted all the specified scope or scopes
 * @returns True if all the scopes are granted
 */
export default function hasGrantedAllScopesGoogle(
  tokenResponse: TokenResponse,
  firstScope: string,
  ...restScopes: string[]
): boolean {
  if (!window.google) return false;

  return window.google.accounts.oauth2.hasGrantedAllScopes(
    tokenResponse,
    firstScope,
    ...restScopes,
  );
}
