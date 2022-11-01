/* eslint-disable */
import { TokenResponse } from "./types";

/**
 * Checks if the user granted any of the specified scope or scopes.
 * @returns True if any of the scopes are granted
 */
export default function hasGrantedAnyScopeGoogle(
  tokenResponse: TokenResponse,
  firstScope: string,
  ...restScopes: string[]
): boolean {
  if (!window.google) return false;

  return window.google.accounts.oauth2.hasGrantedAnyScope(
    tokenResponse,
    firstScope,
    ...restScopes,
  );
}
