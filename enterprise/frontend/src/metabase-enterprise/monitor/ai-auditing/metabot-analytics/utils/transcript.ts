import { match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { getIssueTypeLabel } from "metabase/metabot/components/MetabotChat/feedback-issue-types";
import { renderMetabotProfileLabel } from "metabase/metabot/constants";
import type {
  MetabotAgentDataPartMessage,
  MetabotAgentTurnError,
  MetabotChainStep,
  MetabotDebugToolCallMessage,
  MetabotMessage,
  MetabotMessagePart,
  MetabotMessageStatus,
} from "metabase/metabot/state/types";
import { parseToolCallResult } from "metabase/metabot/utils/tool-call-result";
import { isNotNull } from "metabase/utils/types";
import { getUserName } from "metabase/utils/user";

import type {
  ConversationDetail,
  ConversationFeedback,
  GeneratedQuery,
  MetabotUserInfo,
} from "../types";

export type TranscriptFormat = "markdown" | "json";

export const TRANSCRIPT_FORMATS = {
  markdown: { extension: "md", mimeType: "text/markdown" },
  json: { extension: "json", mimeType: "application/json" },
} as const satisfies Record<
  TranscriptFormat,
  { extension: string; mimeType: string }
>;

type Lines = readonly string[];

const MIN_FENCE_LENGTH = 3;

/**
 * A Markdown transcript of the conversation: its metadata (without IP address
 * or user agent), then the given messages in order, each with its tool calls,
 * the queries those calls generated, and the feedback on it. Pass the branch
 * on screen as `messages`; queries and feedback that belong to other branches
 * are left out (they stay in the JSON). Tool arguments and results are
 * included in full, and JSON is re-printed only when that keeps it exact.
 */
export function conversationToMarkdown(
  conversation: ConversationDetail,
  messages: readonly MetabotMessage[],
): string {
  const lines = joinBlocks([
    renderHeader(conversation),
    renderBranchNote(conversation.messages.length - messages.length),
    renderConversation(conversation, messages),
  ]);
  return `${lines.join("\n")}\n`;
}

const TRANSCRIPT_JSON_FORMAT = "metabase.metabot-conversation";
const TRANSCRIPT_JSON_VERSION = 1;

type TranscriptJsonOptions = {
  /** ISO 8601 timestamp of the export */
  exportedAt: string;
  /** The instance's version tag, or `null` when unknown */
  metabaseVersion: string | null;
};

/**
 * The conversation detail exactly as the API sent it (`rawConversationJson`,
 * the response text), every branch included, in a versioned envelope that
 * says what it is and when it was exported. Compact JSON.
 */
export function conversationToJson(
  rawConversationJson: string,
  { exportedAt, metabaseVersion }: TranscriptJsonOptions,
): string {
  const envelope = JSON.stringify({
    format: TRANSCRIPT_JSON_FORMAT,
    version: TRANSCRIPT_JSON_VERSION,
    exported_at: exportedAt,
    metabase_version: metabaseVersion,
  });
  // Spliced in as text: parsing the conversation would round integers above 2^53.
  return `${envelope.slice(0, -1)},"conversation":${rawConversationJson}}`;
}

export function transcriptFileName(
  { conversation_id }: Pick<ConversationDetail, "conversation_id">,
  format: TranscriptFormat,
): string {
  return `metabot-conversation-${conversation_id}.${TRANSCRIPT_FORMATS[format].extension}`;
}

function renderHeader(conversation: ConversationDetail): Lines {
  const userName = userDisplayName(conversation.user);
  const title = conversation.title || t`Conversation with ${userName}`;
  const {
    conversation_id,
    created_at,
    user,
    profile_id,
    message_count,
    total_tokens,
    query_count,
    search_count,
    forked_from_conversation_id,
  } = conversation;
  const items = [
    t`Conversation ID: ${inlineCode(conversation_id)}`,
    t`Created at: ${created_at}`,
    user ? t`User: ${userName}` : null,
    profile_id ? t`Profile: ${renderMetabotProfileLabel(profile_id)}` : null,
    t`Messages: ${message_count}`,
    t`Total tokens: ${total_tokens}`,
    t`Queries run: ${query_count}`,
    t`Searches: ${search_count}`,
    forked_from_conversation_id
      ? t`Forked from conversation: ${inlineCode(forked_from_conversation_id)}`
      : null,
  ];
  return [`# ${title}`, "", ...items.filter(isNotNull).map(bullet)];
}

function renderBranchNote(messagesOnlyInJson: number): Lines {
  if (messagesOnlyInJson <= 0) {
    return [];
  }
  return [
    italic(
      ngettext(
        msgid`This Markdown follows the branch shown on screen. ${messagesOnlyInJson} message is only in the JSON export.`,
        `This Markdown follows the branch shown on screen. ${messagesOnlyInJson} messages are only in the JSON export.`,
        messagesOnlyInJson,
      ),
    ),
  ];
}

function renderFeedback(feedback: ConversationFeedback): Lines {
  const submitterName = feedback.user ? getUserName(feedback.user) : "";
  const items = [
    bullet(feedbackRating(feedback)),
    submitterName ? bullet(t`Submitted by ${submitterName}`) : null,
  ];
  return joinBlocks([
    [`#### ${t`Feedback`}`],
    items.filter(isNotNull),
    feedback.freeform_feedback ? blockquote(feedback.freeform_feedback) : [],
  ]);
}

function feedbackRating(feedback: ConversationFeedback): string {
  if (feedback.positive) {
    return t`Positive`;
  }
  return feedback.issue_type
    ? t`Negative: ${getIssueTypeLabel(feedback.issue_type)}`
    : t`Negative`;
}

function renderConversation(
  conversation: ConversationDetail,
  messages: readonly MetabotMessage[],
): Lines {
  const { fork_boundary_message_id } = conversation;
  const forkBoundaryIndex = fork_boundary_message_id
    ? messages.findLastIndex(
        (message) => message.externalId === fork_boundary_message_id,
      )
    : -1;
  const body =
    messages.length > 0
      ? joinBlocks(
          messages.map((message, index) =>
            index === forkBoundaryIndex
              ? joinBlocks([
                  renderMessage(message, conversation),
                  renderForkBoundary(conversation.forked_from_conversation_id),
                ])
              : renderMessage(message, conversation),
          ),
        )
      : [italic(t`No messages.`)];
  return [`## ${t`Conversation`}`, "", ...body];
}

function renderForkBoundary(forkedFromId: string | null): Lines {
  const note = forkedFromId
    ? t`The messages above were copied from conversation ${inlineCode(forkedFromId)}.`
    : t`The messages above were copied from a previous conversation.`;
  return ["---", "", italic(note)];
}

function renderMessage(
  message: MetabotMessage,
  conversation: ConversationDetail,
): Lines {
  const id = message.externalId ? ` (${inlineCode(message.externalId)})` : "";
  return joinBlocks([
    [`### ${roleLabel(message.role)}${id}`],
    ...message.parts.map((part) => renderPart(part, conversation)),
    renderStatus(message.status),
    ...feedbackFor(message, conversation.feedback).map(renderFeedback),
  ]);
}

function feedbackFor(
  message: MetabotMessage,
  feedback: readonly ConversationFeedback[],
): ConversationFeedback[] {
  return message.externalId
    ? feedback.filter((item) => item.external_id === message.externalId)
    : [];
}

function roleLabel(role: MetabotMessage["role"]): string {
  return role === "user" ? t`User` : t`Metabot`;
}

function renderStatus(status: MetabotMessageStatus): Lines {
  return match(status)
    .with({ type: "done" }, () => [])
    .with({ type: "streaming" }, () => statusBlock(t`Streaming`, []))
    .with({ type: "in_progress" }, () => statusBlock(t`In progress`, []))
    .with({ type: "aborted" }, () => statusBlock(t`Aborted`, []))
    .with({ type: "incomplete" }, ({ finishReason, contextWindowFull }) =>
      statusBlock(t`Incomplete`, [
        bullet(t`Finish reason: ${finishReason}`),
        ...(contextWindowFull ? [bullet(t`The context window was full.`)] : []),
      ]),
    )
    .with({ type: "errored" }, ({ error, display }) =>
      statusBlock(t`Errored`, describeError(error, display?.message)),
    )
    .exhaustive();
}

function statusBlock(label: string, details: Lines): Lines {
  return joinBlocks([[italic(t`Status: ${label}`)], details]);
}

// The backend sends the raw error text when it isn't JSON, which the client
// type doesn't model.
function describeError(
  error: MetabotAgentTurnError | string,
  displayMessage: string | undefined,
): Lines {
  if (typeof error === "string") {
    return [bullet(t`Error message: ${error}`)];
  }
  const message = error.message ?? displayMessage;
  return [
    error.type ? bullet(t`Error type: ${inlineCode(error.type)}`) : null,
    message ? bullet(t`Error message: ${message}`) : null,
  ].filter(isNotNull);
}

function renderPart(
  part: MetabotMessagePart,
  conversation: ConversationDetail,
): Lines {
  return match(part)
    .with({ type: "text", role: "user" }, ({ message }) =>
      renderUserText(message),
    )
    .with({ type: "text", role: "agent" }, ({ message }) =>
      renderAgentText(message),
    )
    .with({ type: "chain_of_thought" }, ({ steps }) => renderReasoning(steps))
    .with({ type: "tool_call" }, (toolCall) =>
      renderToolCall(
        toolCall,
        conversation.queries.filter((query) => query.call_id === toolCall.id),
      ),
    )
    .with({ type: "data_part" }, renderDataPart)
    .exhaustive(renderUnknownPart);
}

function renderUnknownPart(part: unknown): Lines {
  const type =
    typeof part === "object" &&
    part != null &&
    "type" in part &&
    typeof part.type === "string"
      ? part.type
      : t`unknown`;
  return [italic(t`Unsupported message part: ${type}`)];
}

function renderDataPart({ part }: MetabotAgentDataPartMessage): Lines {
  return joinBlocks([
    [italic(t`Data part: ${part.type}`)],
    codeFence(JSON.stringify(part.data, null, 2), "json"),
  ]);
}

// User text is shown verbatim and inert: as Markdown it could imitate the
// transcript's structure or carry live HTML and images.
function renderUserText(text: string): Lines {
  const trimmed = trimNewlines(text);
  return trimmed ? codeFence(trimmed, "text") : [];
}

function trimNewlines(text: string): string {
  return text.replace(/^\n+|\n+$/g, "");
}

function renderAgentText(text: string): Lines {
  const trimmed = trimNewlines(text);
  if (!trimmed) {
    return [];
  }
  const openFence = findOpenFence(trimmed);
  return openFence ? [trimmed, openFence] : [trimmed];
}

const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

// The fence of a code block still open at the end of the text, so the
// transcript can close it before it swallows the rest of the document.
function findOpenFence(text: string): string | null {
  return text.split("\n").reduce<string | null>((openFence, line) => {
    const [, fence, rest] = FENCE_LINE.exec(line) ?? [];
    if (!fence) {
      return openFence;
    }
    if (openFence == null) {
      const isBacktickInfoInvalid = fence[0] === "`" && rest.includes("`");
      return isBacktickInfoInvalid ? null : fence;
    }
    const closesOpenFence =
      fence[0] === openFence[0] &&
      fence.length >= openFence.length &&
      rest.trim() === "";
    return closesOpenFence ? null : openFence;
  }, null);
}

function renderReasoning(steps: readonly MetabotChainStep[]): Lines {
  if (steps.length === 0) {
    return [];
  }
  return joinBlocks([[`#### ${t`Reasoning`}`], ...groupSteps(steps)]);
}

// Consecutive tool steps form one list; each reasoning step is its own quote.
function groupSteps(steps: readonly MetabotChainStep[]): Lines[] {
  return steps.reduce<Lines[]>((blocks, step, index) => {
    const lines = renderStep(step);
    const continuesList =
      step.kind === "tool" && steps[index - 1]?.kind === "tool";
    return continuesList
      ? [...blocks.slice(0, -1), [...blocks[blocks.length - 1], ...lines]]
      : [...blocks, lines];
  }, []);
}

function renderStep(step: MetabotChainStep): Lines {
  return match(step)
    .with({ kind: "reasoning" }, ({ text }) => blockquote(text))
    .with({ kind: "tool" }, ({ name, title, status }) => {
      const titleText = title ? `: ${title}` : "";
      return [
        `- ${inlineCode(name)}${titleText} (${toolStepStatusLabel(status)})`,
      ];
    })
    .exhaustive();
}

function toolStepStatusLabel(
  status: Extract<MetabotChainStep, { kind: "tool" }>["status"],
): string {
  return match(status)
    .with("started", () => t`started`)
    .with("ended", () => t`ended`)
    .with("errored", () => t`errored`)
    .exhaustive();
}

function renderToolCall(
  part: MetabotDebugToolCallMessage,
  queries: readonly GeneratedQuery[],
): Lines {
  return joinBlocks([
    [`#### ${t`Tool call: ${inlineCode(part.name)} (${inlineCode(part.id)})`}`],
    part.args != null ? labelledJsonOrText(t`Arguments:`, part.args) : [],
    renderToolResult(part),
    ...queries.map((query) =>
      renderGeneratedQuery(query, {
        isResultExact: part.result == null || reprintsExactly(part.result),
      }),
    ),
  ]);
}

function renderToolResult(part: MetabotDebugToolCallMessage): Lines {
  const payload = part.result
    ? joinBlocks(renderResultPayload(part.result))
    : [];
  if (part.is_error) {
    return payload.length > 0
      ? joinBlocks([[italic(t`Result: error`)], payload])
      : [italic(t`Result: error (no output stored)`)];
  }
  if (payload.length > 0) {
    return payload;
  }
  return part.status === "started"
    ? [italic(t`No result: the tool call did not finish.`)]
    : [italic(t`No result recorded.`)];
}

function renderResultPayload(result: string): Lines[] {
  const decoded = parseJson(result);
  if (decoded.ok && typeof decoded.value === "string") {
    return [labelledBlock(t`Output:`, codeFence(decoded.value, ""))];
  }
  if (decoded.ok && !reserializesExactly(decoded.value, result)) {
    return [labelledBlock(t`Result:`, codeFence(result, "json"))];
  }
  const { output, structuredOutput, extra } = parseToolCallResult(result);
  return [
    output != null ? labelledBlock(t`Output:`, codeFence(output, "")) : [],
    structuredOutput != null
      ? labelledBlock(
          t`Structured output:`,
          codeFence(structuredOutput, "json"),
        )
      : [],
    extra != null
      ? labelledBlock(t`Other fields:`, codeFence(extra, "json"))
      : [],
  ];
}

function labelledBlock(label: string, block: Lines): Lines {
  return [label, "", ...block];
}

function labelledJsonOrText(label: string, payload: string): Lines {
  const decoded = parseJson(payload);
  if (!decoded.ok) {
    return labelledBlock(label, codeFence(payload, ""));
  }
  const json = reserializesExactly(decoded.value, payload)
    ? JSON.stringify(decoded.value, null, 2)
    : payload;
  return labelledBlock(label, codeFence(json, "json"));
}

// The page receives `mbql` already parsed, so a number JSON.parse rounded is
// wrong there; the tool call's raw result above it is the exact record.
function renderGeneratedQuery(
  query: GeneratedQuery,
  { isResultExact }: { isResultExact: boolean },
): Lines {
  const queryType = match(query.query_type)
    .with("sql", () => t`SQL`)
    .with("notebook", () => t`Notebook`)
    .exhaustive();
  const items = [
    bullet(t`Query type: ${queryType}`),
    query.database_id != null
      ? bullet(t`Database ID: ${query.database_id}`)
      : null,
    query.tables.length > 0
      ? bullet(t`Tables: ${query.tables.join(", ")}`)
      : null,
  ];
  return joinBlocks([
    [t`Generated query:`],
    items.filter(isNotNull),
    queryBody(query, isResultExact),
  ]);
}

function queryBody(query: GeneratedQuery, isResultExact: boolean): Lines {
  if (query.query_type === "notebook") {
    if (!isResultExact) {
      return [italic(t`The query is shown exactly in the result above.`)];
    }
    return query.mbql
      ? codeFence(JSON.stringify(query.mbql, null, 2), "json")
      : [];
  }
  return query.sql ? codeFence(query.sql, "sql") : [];
}

function joinBlocks(blocks: readonly Lines[]): Lines {
  return blocks
    .filter((block) => block.length > 0)
    .flatMap((block, index) => (index === 0 ? block : ["", ...block]));
}

function userDisplayName(user: MetabotUserInfo | null): string {
  return (user && getUserName(user)) || t`Unknown`;
}

function bullet(text: string): string {
  return `- ${text}`;
}

function inlineCode(value: string): string {
  return `\`${value}\``;
}

function italic(text: string): string {
  return `_${text}_`;
}

function blockquote(text: string): Lines {
  return text.split("\n").map((line) => (line ? `> ${line}` : ">"));
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

// Parsing loses precision (integers above 2^53) and number spelling (`1.0`),
// so a parsed value may be re-printed only when that reproduces the source.
function reserializesExactly(value: unknown, source: string): boolean {
  return JSON.stringify(value) === source;
}

/** Whether JSON text survives a parse and re-print unchanged; text that isn't JSON does. */
function reprintsExactly(text: string): boolean {
  const decoded = parseJson(text);
  return !decoded.ok || reserializesExactly(decoded.value, text);
}

/** A fenced code block whose fence is longer than any backtick run inside. */
function codeFence(content: string, language: string): Lines {
  const longestBacktickRun = (content.match(/`+/g) ?? []).reduce(
    (longest, run) => Math.max(longest, run.length),
    0,
  );
  const fence = "`".repeat(Math.max(MIN_FENCE_LENGTH, longestBacktickRun + 1));
  return [`${fence}${language}`, content, fence];
}
