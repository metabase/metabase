/**
 * Provide documentation links for each error codes.
 * Custom fields get removed when serializing errors, so
 * we need to store doc urls separately.
 **/
export const ERROR_DOC_LINKS: Record<string, string> = {
  EXISTING_USER_SESSION_FAILED:
    // eslint-disable-next-line no-unconditional-metabase-links-render -- error documentation link
    "https://www.metabase.com/docs/latest/embedding/embedded-analytics-js#use-existing-user-session-to-test-embeds",
};
