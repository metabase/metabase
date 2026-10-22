// The review-comments channel, the dev-preview counterpart of
// `constants/diagnostics-channel.ts`: the page writes comments an author left on
// the running app, and whichever coding agent the author uses reads them back.

/** Server → page nudge. Carries no data: readers re-read the endpoint. */
export const DATA_APP_COMMENTS_CHANGED_EVENT = "data-app:comments-changed";

export const DATA_APP_COMMENTS_URL = "/__data-app/comments";

/** Runs the configured agent command against one comment. */
export const DATA_APP_COMMENTS_RUN_URL = "/__data-app/comments/run";

export const STATUS_PARAM = "status";

export const ID_PARAM = "id";

/**
 * Proves a mutating request came from the preview page: the token is served only
 * in the page's virtual config, which no cross-origin page can read. Without it
 * any site open in the same browser could POST to the dev server and have it run
 * the agent command.
 */
export const DATA_APP_DEV_TOKEN_HEADER = "x-data-app-dev-token";

/** Where the dev server keeps the comments an agent reads without the server. */
export const DATA_APP_COMMENTS_DIRECTORY = ".data-app";

export const DATA_APP_COMMENTS_FILE_NAME = "comments.json";

/** The env var holding the command that hands a comment to a coding agent. */
export const DATA_APP_AGENT_CMD_ENV = "DATA_APP_AGENT_CMD";

/** Replaced in the agent command with the path of the comment's prompt file. */
export const PROMPT_FILE_PLACEHOLDER = "{promptFile}";

export const DATA_APP_COMMENTS_LIMIT = 200;

export const DATA_APP_COMMENT_MAX_BODY_CHARS = 2000;

/** Per-field limit for everything captured off the page about the selection. */
export const DATA_APP_COMMENT_MAX_TARGET_CHARS = 1200;

export const DATA_APP_AGENT_MAX_OUTPUT_CHARS = 20000;

/** How often the dock re-reads the comments feed regardless of nudges. */
export const COMMENTS_POLL_MS = 2000;
