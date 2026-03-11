import type { MetabaseErrorCode } from "./error-code";

type ErrorDocLinks = Partial<Record<MetabaseErrorCode, string>>;

/**
 * Provide documentation links for each error codes.
 * Custom fields get removed when serializing errors, so
 * we need to store doc urls separately.
 **/
export const ERROR_DOC_LINKS: ErrorDocLinks = {
  EXISTING_USER_SESSION_FAILED:
    // eslint-disable-next-line metabase/no-unconditional-metabase-links-render -- error documentation link
    "https://www.metabase.com/docs/latest/embedding/embedded-analytics-js#use-existing-user-session-to-test-embeds",
};
