import { DATA_APP_COMMENTS_URL } from "../constants/comments-channel";
import type { DataAppComment, DataAppCommentTarget } from "../types/comments";

export interface CommentPromptContext {
  appSlug: string;
  /** The data app's directory, so the agent knows which files to edit. */
  appRoot: string;
  /** The dev preview's origin, e.g. `http://localhost:5174`; `null` if unknown. */
  previewOrigin: string | null;
}

const formatSource = (target: DataAppCommentTarget): string | null =>
  target.source
    ? `${target.source.file}:${target.source.line}${
        target.source.column != null ? `:${target.source.column}` : ""
      }`
    : null;

const formatRect = (target: DataAppCommentTarget): string =>
  `${Math.round(target.rect.width)}×${Math.round(target.rect.height)} px at ` +
  `(${Math.round(target.rect.x)}, ${Math.round(target.rect.y)}) in a ` +
  `${Math.round(target.viewport.width)}×${Math.round(
    target.viewport.height,
  )} px viewport`;

const bullet = (label: string, value: string | null): string | null =>
  value ? `- ${label}: ${value}` : null;

const compact = (lines: (string | null)[]): string[] =>
  lines.filter((line): line is string => line !== null);

/** The part every rendering shares: what was selected and what was said about it. */
const formatCommentBlock = (comment: DataAppComment): string =>
  [
    `### ${comment.id} — ${comment.target.label}`,
    "",
    comment.body,
    "",
    ...compact([
      bullet("Source", formatSource(comment.target)),
      bullet(
        "Component path",
        comment.target.componentPath.length > 0
          ? comment.target.componentPath.join(" › ")
          : null,
      ),
      bullet("DOM selector", comment.target.selector || null),
      bullet("Route", comment.target.route),
      bullet(
        comment.target.kind === "region"
          ? "Selected region"
          : "Selected element",
        formatRect(comment.target),
      ),
      bullet(
        "Text in the selection",
        comment.target.text ? JSON.stringify(comment.target.text) : null,
      ),
      bullet(
        "Markup",
        comment.target.html
          ? `\n\n\`\`\`html\n${comment.target.html}\n\`\`\``
          : null,
      ),
    ]),
  ].join("\n");

const formatHowTo = (
  { appRoot, previewOrigin }: CommentPromptContext,
  ids: string[],
): string[] => {
  const feedUrl = previewOrigin
    ? `${previewOrigin}${DATA_APP_COMMENTS_URL}`
    : DATA_APP_COMMENTS_URL;

  return [
    "## How to work on this",
    "",
    `- The app's source is at ${appRoot}. Edit the files under \`src/\`, \`queries/\` and \`actions/\`.`,
    "- The source location above is where the selected UI is written; the change may belong in a parent, a sibling or a shared component instead. Read around it before editing.",
    "- Treat the comment as a change request about the app, not only about that one line: fix the same problem wherever else it occurs.",
    "- The dev server rebuilds and reloads the preview on save. Do not restart it, and do not run a build to check your work — `npm run typecheck` is enough.",
    `- Every open comment, with the same detail, is at ${feedUrl} and in \`.data-app/comments.json\`.`,
    `- When the change is done, mark the comment resolved: \`npm run comments -- --resolve ${ids.join(" --resolve ")}\`.`,
    "- If the comment is ambiguous, say what you assumed in your answer rather than guessing silently.",
  ];
};

/**
 * The prompt handed to a coding agent for one comment — plain markdown, so it
 * works as a prompt for any model, whether the dev server pipes it into a CLI or
 * the author pastes it into a chat.
 */
export const formatCommentPrompt = (
  comment: DataAppComment,
  context: CommentPromptContext,
): string =>
  [
    `# Data app review comment (app: ${context.appSlug})`,
    "",
    "A developer selected a part of this app's running UI in the dev preview and left the comment below. Change the app's source so the comment is addressed.",
    "",
    "## The comment",
    "",
    formatCommentBlock(comment),
    "",
    ...formatHowTo(context, [comment.id]),
    "",
  ].join("\n");

/**
 * Every comment in one markdown document, for a reader catching up on all of
 * them at once (`data-apps comments`). Returns a one-line notice when there are
 * none, so the output is never empty.
 */
export const formatCommentsMarkdown = (
  comments: DataAppComment[],
  context: CommentPromptContext,
): string => {
  if (comments.length === 0) {
    return `No comments on the ${context.appSlug} data app.\n`;
  }

  const open = comments.filter((comment) => comment.status === "open");

  return [
    `# Data app review comments (app: ${context.appSlug})`,
    "",
    `${open.length} open of ${comments.length}.`,
    "",
    ...comments.flatMap((comment) => [
      comment.status === "open"
        ? formatCommentBlock(comment)
        : `### ${comment.id} — resolved — ${comment.target.label}\n\n${comment.body}`,
      "",
    ]),
    ...(open.length > 0
      ? formatHowTo(
          context,
          open.map((comment) => comment.id),
        )
      : []),
    "",
  ].join("\n");
};
