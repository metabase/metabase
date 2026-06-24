/* eslint-disable metabase/no-literal-metabase-strings */

const ANTI_CSRF_HEADER = "X-Metabase-Anti-CSRF-Token";

let ANTI_CSRF_TOKEN: string | null = null;

export function updateAntiCsrfToken(response: Response) {
  const token = response.headers.get(ANTI_CSRF_HEADER);
  if (token) {
    ANTI_CSRF_TOKEN = token;
  }
}

export function addAntiCsrfToken(request: Request) {
  if (ANTI_CSRF_TOKEN) {
    request.headers.set(ANTI_CSRF_HEADER, ANTI_CSRF_TOKEN);
  }
}
