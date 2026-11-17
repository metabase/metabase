/** Read from the repo-root `.env.local`; see `config/find-env-root.ts`. */
export const DATA_APP_MB_URL_ENV = "DATA_APP_MB_URL";

export const DATA_APP_MB_API_KEY_ENV = "DATA_APP_MB_API_KEY";

/**
 * The instance a `DATA_APP_MB_URL` value names, or null when it's unset or not an `http(s)` URL. `URL` alone accepts
 * `localhost:3000`, reading `localhost:` as the scheme.
 */
export const parseInstanceUrl = (
  value: string | null | undefined,
): URL | null => {
  if (!value || !URL.canParse(value)) {
    return null;
  }

  const url = new URL(value);

  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
};
