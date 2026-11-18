import userEvent from "@testing-library/user-event";

import { createMockMetabotToolCallPart } from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import type { MetabotDebugToolCallMessage } from "metabase/metabot/state/types";
import {
  EMPTY_STRUCTURED_QUERY,
  createMockGroup,
  createMockTenant,
  createMockUser,
} from "metabase-types/api/mocks";

import type { ConversationDetail, GeneratedQuery } from "../types";

export const BOBBY = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  common_name: "Bobby Tables",
});

export const ROBERT = createMockUser({
  id: 2,
  first_name: "Robert",
  last_name: "Tableton",
  common_name: "Robert Tableton",
});

export const ALL_USERS_GROUP = createMockGroup({ id: 1, name: "All Users" });
export const ADMIN_GROUP = createMockGroup({ id: 2, name: "Administrators" });
export const DATA_GROUP = createMockGroup({ id: 5, name: "data" });

export const BOBBY_TENANT = createMockTenant({
  id: 1,
  name: "Bobby Analytics",
  slug: "bobby-analytics",
});

export const ROBERT_TENANT = createMockTenant({
  id: 2,
  name: "Robert Analytics",
  slug: "robert-analytics",
});

export async function selectFilterOption(testId: string, optionName: string) {
  await userEvent.click(screen.getByTestId(testId));
  const dropdown = await screen.findByRole("listbox");
  await userEvent.click(
    within(dropdown).getByRole("option", { name: optionName }),
  );
}

export function createMockConversationDetail(
  opts?: Partial<ConversationDetail>,
): ConversationDetail {
  return {
    conversation_id: "convo-1",
    created_at: "2026-01-01T00:00:00Z",
    title: "A conversation",
    user: null,
    message_count: 2,
    total_tokens: 30,
    profile_id: "internal",
    slack_permalink: null,
    messages: [],
    queries: [],
    search_count: 0,
    query_count: 0,
    ip_address: null,
    embedding_hostname: null,
    embedding_path: null,
    user_agent: null,
    sanitized_user_agent: null,
    forked_from_conversation_id: null,
    fork_boundary_message_id: null,
    feedback: [],
    ...opts,
  };
}

export function createMockGeneratedQuery(
  opts?: Partial<GeneratedQuery>,
): GeneratedQuery {
  return {
    tool: "construct_sql",
    call_id: "call-1",
    message_id: 1,
    query_id: "q-1",
    query_type: "sql",
    sql: "SELECT 1",
    mbql: null,
    display: null,
    database_id: 1,
    tables: [],
    ...opts,
  };
}

export function createMockGeneratedNotebookQuery(
  opts?: Partial<GeneratedQuery>,
): GeneratedQuery {
  return createMockGeneratedQuery({
    tool: "construct_notebook_query",
    query_type: "notebook",
    sql: null,
    mbql: EMPTY_STRUCTURED_QUERY,
    display: "table",
    ...opts,
  });
}

type ToolCallOpts = Partial<
  Pick<MetabotDebugToolCallMessage, "id" | "name" | "args">
>;

/** A tool call that returned `output`, stored as the backend stores it. */
export function createMockSucceededToolCall({
  output,
  ...opts
}: ToolCallOpts & { output: unknown }): MetabotDebugToolCallMessage {
  return createMockMetabotToolCallPart({
    ...opts,
    status: "ended",
    is_error: false,
    result: JSON.stringify(output),
  });
}

/** A failed tool call: the backend stores no output for it. */
export function createMockFailedToolCall(
  opts?: ToolCallOpts,
): MetabotDebugToolCallMessage {
  return createMockMetabotToolCallPart({
    ...opts,
    status: "ended",
    is_error: true,
    result: undefined,
  });
}

/** A finished tool call with no output, e.g. an aborted turn. */
export function createMockToolCallWithoutOutput(
  opts?: ToolCallOpts,
): MetabotDebugToolCallMessage {
  return createMockMetabotToolCallPart({
    ...opts,
    status: "ended",
    result: undefined,
  });
}

/**
 * A finished tool call whose stored result is exactly `result`, for JSON that
 * `JSON.stringify` can't produce, such as an integer above 2^53.
 */
export function createMockToolCallWithRawResult({
  result,
  ...opts
}: ToolCallOpts & { result: string }): MetabotDebugToolCallMessage {
  return createMockMetabotToolCallPart({
    ...opts,
    status: "ended",
    is_error: false,
    result,
  });
}
