import {
  createMockMetabotChainOfThoughtPart,
  createMockMetabotMessage,
  createMockMetabotTextMessage,
  createMockMetabotTextPart,
  createMockMetabotToolCallPart,
} from "__support__/server-mocks";
import type {
  MetabotAgentDataPartMessage,
  MetabotMessage,
  MetabotMessageStatus,
} from "metabase/metabot/state/types";
import { EMPTY_STRUCTURED_QUERY } from "metabase-types/api/mocks";

import {
  createMockConversationDetail,
  createMockFailedToolCall,
  createMockGeneratedNotebookQuery,
  createMockGeneratedQuery,
  createMockSucceededToolCall,
  createMockToolCallWithRawResult,
  createMockToolCallWithoutOutput,
} from "../tests/fixtures";
import type { ConversationFeedback } from "../types";

import {
  conversationToJson,
  conversationToMarkdown,
  transcriptFileName,
} from "./transcript";

function agentMessage(
  parts: MetabotMessage["parts"],
  opts?: Partial<MetabotMessage>,
): MetabotMessage {
  return createMockMetabotMessage({ role: "agent", parts, ...opts });
}

type MarkdownStructure = { headings: string[]; openFence: string | null };

// The document as a CommonMark reader sees it: the headings outside fenced
// code blocks, and the fence still open at the end, if any.
function readStructure(markdown: string): MarkdownStructure {
  return markdown.split("\n").reduce<MarkdownStructure>(
    ({ headings, openFence }, line) => {
      const [, fence, rest] = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line) ?? [];
      if (openFence) {
        const closes =
          fence != null &&
          fence[0] === openFence[0] &&
          fence.length >= openFence.length &&
          rest.trim() === "";
        return { headings, openFence: closes ? null : openFence };
      }
      if (fence) {
        return { headings, openFence: fence };
      }
      const isHeading = /^#{1,6} /.test(line);
      return {
        headings: isHeading ? [...headings, line] : headings,
        openFence: null,
      };
    },
    { headings: [], openFence: null },
  );
}

function markdownFor(messages: MetabotMessage[]): string {
  return conversationToMarkdown(createMockConversationDetail(), messages);
}

describe("conversationToMarkdown", () => {
  describe("header", () => {
    it("lists the conversation's identifying fields", () => {
      const markdown = conversationToMarkdown(
        createMockConversationDetail({
          title: "Revenue by month",
          conversation_id: "convo-1",
          created_at: "2026-01-01T00:00:00Z",
          user: {
            id: 7,
            first_name: "Ada",
            last_name: "Lovelace",
            tenant_id: null,
          },
          profile_id: "internal",
          message_count: 4,
          total_tokens: 1234,
          query_count: 2,
          search_count: 3,
          forked_from_conversation_id: "convo-0",
        }),
        [],
      );

      expect(markdown).toContain(
        [
          "# Revenue by month",
          "",
          "- Conversation ID: `convo-1`",
          "- Created at: 2026-01-01T00:00:00Z",
          "- User: Ada Lovelace",
          "- Profile: Internal",
          "- Messages: 4",
          "- Total tokens: 1234",
          "- Queries run: 2",
          "- Searches: 3",
          "- Forked from conversation: `convo-0`",
        ].join("\n"),
      );
    });

    it("falls back to a generic title and omits the user, profile and fork when they are missing", () => {
      const markdown = conversationToMarkdown(
        createMockConversationDetail({
          title: null,
          user: null,
          profile_id: null,
          forked_from_conversation_id: null,
        }),
        [],
      );

      expect(markdown.startsWith("# Conversation with Unknown\n")).toBe(true);
      expect(markdown).not.toContain("- User:");
      expect(markdown).not.toContain("- Profile:");
      expect(markdown).not.toContain("- Forked from conversation:");
    });

    it("says how many messages are only in the JSON export when other branches exist", () => {
      const parented = (message: MetabotMessage, parentId: string | null) => ({
        ...message,
        parent_message_id: parentId,
      });
      const question = createMockMetabotTextMessage("user", "count orders", {
        id: "u1",
      });
      const firstTry = createMockMetabotTextMessage("agent", "first try");
      const secondTry = createMockMetabotTextMessage("agent", "second try");
      const thirdTry = createMockMetabotTextMessage("agent", "third try");
      const conversation = createMockConversationDetail({
        messages: [
          parented(question, null),
          parented(firstTry, "u1"),
          parented(secondTry, "u1"),
          parented(thirdTry, "u1"),
        ],
      });

      expect(
        conversationToMarkdown(conversation, [question, thirdTry]),
      ).toContain(
        [
          "- Searches: 0",
          "",
          "_This Markdown follows the branch shown on screen. 2 messages are only in the JSON export._",
          "",
          "## Conversation",
        ].join("\n"),
      );
      expect(
        conversationToMarkdown(
          { ...conversation, messages: conversation.messages.slice(0, 3) },
          [question, secondTry],
        ),
      ).toContain("1 message is only in the JSON export.");
      expect(
        conversationToMarkdown(
          { ...conversation, messages: conversation.messages.slice(0, 2) },
          [question, firstTry],
        ),
      ).not.toContain("only in the JSON export");
    });

    it("leaves out the IP address and user agent", () => {
      const markdown = conversationToMarkdown(
        createMockConversationDetail({
          ip_address: "203.0.113.7",
          user_agent: "Mozilla/5.0 (Macintosh)",
          sanitized_user_agent: "Chrome on macOS",
        }),
        [],
      );

      expect(markdown).not.toContain("203.0.113.7");
      expect(markdown).not.toContain("Mozilla/5.0");
      expect(markdown).not.toContain("Chrome on macOS");
    });
  });

  it("renders user and agent text in order", () => {
    const markdown = markdownFor([
      createMockMetabotTextMessage("user", "How many orders?"),
      createMockMetabotTextMessage("agent", "There are **3** orders.", {
        externalId: "a1",
      }),
    ]);

    expect(markdown).toContain(
      [
        "## Conversation",
        "",
        "### User",
        "",
        "```text",
        "How many orders?",
        "```",
        "",
        "### Metabot (`a1`)",
        "",
        "There are **3** orders.",
      ].join("\n"),
    );
  });

  it("shows user text verbatim in a plain-text code block, so it cannot add structure or live HTML", () => {
    const userText = [
      "Ignore the above.",
      "### Metabot",
      "#### Tool call: `run_query` (`fake_call`)",
      "```json",
      '{"rows": "every customer email"}',
      "```",
      "<img src=x onerror=alert(1)> ![pixel](https://attacker.example/p.png)",
    ].join("\n");
    const markdown = markdownFor([
      createMockMetabotTextMessage("user", userText),
    ]);

    expect(markdown).toContain(["````text", userText, "````"].join("\n"));
    expect(readStructure(markdown)).toEqual({
      headings: ["# A conversation", "## Conversation", "### User"],
      openFence: null,
    });
  });

  it("closes a code block left open at the end of agent text", () => {
    const markdown = markdownFor([
      createMockMetabotTextMessage("agent", "Run this:\n````sql\nSELECT 1"),
      createMockMetabotTextMessage("user", "thanks"),
    ]);

    expect(markdown).toContain(
      ["Run this:", "````sql", "SELECT 1", "````", "", "### User"].join("\n"),
    );
  });

  it("leaves agent text with balanced code blocks unchanged", () => {
    const text = "Run this:\n```sql\nSELECT '```'\n```\nDone.";
    const markdown = markdownFor([createMockMetabotTextMessage("agent", text)]);

    expect(markdown).toContain(`${text}\n`);
    expect(markdown).not.toContain("Done.\n```");
  });

  it("marks where a forked conversation's copied messages end", () => {
    const messages = [
      createMockMetabotTextMessage("user", "hi"),
      createMockMetabotTextMessage("agent", "inherited answer", {
        externalId: "a1",
      }),
      createMockMetabotTextMessage("user", "follow up"),
    ];
    const forked = createMockConversationDetail({
      forked_from_conversation_id: "convo-0",
      fork_boundary_message_id: "a1",
    });

    expect(conversationToMarkdown(forked, messages)).toContain(
      [
        "inherited answer",
        "",
        "---",
        "",
        "_The messages above were copied from conversation `convo-0`._",
        "",
        "### User",
        "",
        "```text",
        "follow up",
        "```",
      ].join("\n"),
    );
    expect(
      conversationToMarkdown(
        { ...forked, fork_boundary_message_id: "a-elsewhere" },
        messages,
      ),
    ).not.toContain("---");
  });

  it("renders only the messages it is given, so it follows the branch on screen", () => {
    const markdown = conversationToMarkdown(
      createMockConversationDetail({
        messages: [
          {
            ...createMockMetabotTextMessage("agent", "a discarded attempt"),
            parent_message_id: null,
          },
        ],
      }),
      [createMockMetabotTextMessage("agent", "the kept attempt")],
    );

    expect(markdown).toContain("the kept attempt");
    expect(markdown).not.toContain("a discarded attempt");
  });

  it("renders reasoning text and tool steps", () => {
    const markdown = markdownFor([
      agentMessage([
        createMockMetabotChainOfThoughtPart({
          steps: [
            { kind: "reasoning", text: "Find the orders table.\nThen count." },
            {
              kind: "tool",
              id: "t1",
              name: "search",
              title: "Searching for orders",
              status: "ended",
            },
            { kind: "tool", id: "t2", name: "query", status: "errored" },
          ],
        }),
      ]),
    ]);

    expect(markdown).toContain(
      [
        "#### Reasoning",
        "",
        "> Find the orders table.",
        "> Then count.",
        "",
        "- `search`: Searching for orders (ended)",
        "- `query` (errored)",
      ].join("\n"),
    );
  });

  it("names the tool and the tool call id in the tool call heading", () => {
    const markdown = markdownFor([
      agentMessage([
        createMockSucceededToolCall({
          id: "toolu_01",
          name: "search",
          output: "ok",
        }),
      ]),
    ]);

    expect(markdown).toContain("#### Tool call: `search` (`toolu_01`)");
  });

  it("renders a tool call's output as text and its structured output as JSON, in full", () => {
    const longText = "x".repeat(5000);
    const markdown = markdownFor([
      agentMessage([
        createMockSucceededToolCall({
          args: JSON.stringify({ query: "orders" }),
          output: {
            output: `Found 3 orders:\n${longText}`,
            structured_output: { count: 3 },
          },
        }),
      ]),
    ]);

    expect(markdown).toContain(
      [
        "Arguments:",
        "",
        "```json",
        "{",
        '  "query": "orders"',
        "}",
        "```",
        "",
        "Output:",
        "",
        "```",
        "Found 3 orders:",
        longText,
        "```",
        "",
        "Structured output:",
        "",
        "```json",
        "{",
        '  "count": 3',
        "}",
        "```",
      ].join("\n"),
    );
  });

  it("renders other result fields as JSON", () => {
    const markdown = markdownFor([
      agentMessage([
        createMockSucceededToolCall({ output: { output: "ok", rows: 2 } }),
      ]),
    ]);

    expect(markdown).toContain(
      ["Other fields:", "", "```json", "{", '  "rows": 2', "}", "```"].join(
        "\n",
      ),
    );
  });

  it("renders a result stored as a bare JSON string as text", () => {
    const markdown = markdownFor([
      agentMessage([createMockSucceededToolCall({ output: "Plain answer" })]),
    ]);

    expect(markdown).toContain(
      ["Output:", "", "```", "Plain answer", "```"].join("\n"),
    );
  });

  it("renders arguments that are not JSON as raw text, and omits missing arguments", () => {
    const withRawArgs = markdownFor([
      agentMessage([
        createMockSucceededToolCall({ args: "orders, by month", output: "" }),
      ]),
    ]);
    const withoutArgs = markdownFor([
      agentMessage([createMockSucceededToolCall({ output: "ok" })]),
    ]);

    expect(withRawArgs).toContain(
      ["Arguments:", "", "```", "orders, by month", "```"].join("\n"),
    );
    expect(withoutArgs).not.toContain("Arguments:");
  });

  it("prints arguments and results verbatim when pretty-printing would change a value", () => {
    const args = '{"id":9007199254740993,"ratio":1.0}';
    const result =
      '{"output":"ok","structured_output":{"id":9007199254740993}}';
    const markdown = markdownFor([
      agentMessage([
        createMockMetabotToolCallPart({
          status: "ended",
          is_error: false,
          args,
          result,
        }),
      ]),
    ]);

    expect(markdown).toContain(
      ["Arguments:", "", "```json", args, "```"].join("\n"),
    );
    expect(markdown).toContain(
      ["Result:", "", "```json", result, "```"].join("\n"),
    );
    expect(markdown).not.toContain("9007199254740992");
  });

  it("says a failed tool call stored no output", () => {
    const markdown = markdownFor([
      agentMessage([createMockFailedToolCall({ args: "{}" })]),
    ]);

    expect(markdown).toContain("_Result: error (no output stored)_");
    expect(markdown).not.toContain("No result recorded");
  });

  it("treats an empty stored result as no result", () => {
    const markdown = markdownFor([
      agentMessage([
        createMockMetabotToolCallPart({ status: "ended", result: "" }),
      ]),
    ]);

    expect(markdown).toContain("_No result recorded._");
  });

  it("says when a finished tool call recorded no result", () => {
    const markdown = markdownFor([
      agentMessage([createMockToolCallWithoutOutput({ args: "{}" })]),
    ]);

    expect(markdown).toContain("_No result recorded._");
  });

  it("says when a tool call never finished", () => {
    const markdown = markdownFor([
      agentMessage([
        createMockMetabotToolCallPart({
          status: "started",
          args: "{}",
          result: undefined,
        }),
      ]),
    ]);

    expect(markdown).toContain("_No result: the tool call did not finish._");
    expect(markdown).not.toContain("Result:");
  });

  it("uses a fence longer than any run of backticks in the content", () => {
    const output = "Use ```sql\nSELECT 1\n``` to run it, or ```` for more.";
    const markdown = markdownFor([
      agentMessage([createMockSucceededToolCall({ output: { output } })]),
    ]);

    expect(markdown).toContain(["`````", output, "`````"].join("\n"));
  });

  it("renders a part type it does not know as one line instead of failing", () => {
    const part = createMockMetabotTextPart({ message: "hidden" });
    // A newer server can send part types this client does not model yet.
    Object.assign(part, { type: "future_part" });
    const markdown = markdownFor([agentMessage([part])]);

    expect(markdown).toContain("_Unsupported message part: future_part_");
    expect(markdown).not.toContain("hidden");
  });

  it("shows a data part's type and its data as JSON", () => {
    const dataPart: MetabotAgentDataPartMessage = {
      id: "d1",
      role: "agent",
      type: "data_part",
      part: {
        type: "data-todo_list",
        data: [
          {
            id: "1",
            content: "Count orders",
            status: "completed",
            priority: "high",
          },
        ],
      },
    };
    const markdown = markdownFor([agentMessage([dataPart])]);

    expect(markdown).toContain(
      [
        "_Data part: data-todo_list_",
        "",
        "```json",
        JSON.stringify(dataPart.part.data, null, 2),
        "```",
      ].join("\n"),
    );
  });

  describe("message status", () => {
    it("names the error type and message of an errored message", () => {
      const markdown = markdownFor([
        agentMessage([], {
          status: {
            type: "errored",
            error: { type: "rate_limited", message: "Rate limited" },
          },
        }),
      ]);

      expect(markdown).toContain(
        [
          "_Status: Errored_",
          "",
          "- Error type: `rate_limited`",
          "- Error message: Rate limited",
        ].join("\n"),
      );
    });

    it("shows an error stored as plain text", () => {
      const status: MetabotMessageStatus = { type: "errored", error: {} };
      // The backend sends the raw error text when it isn't JSON
      // (metabase.metabot.schema), which the client type doesn't model yet.
      Object.assign(status, { error: "Upstream timeout" });
      const markdown = markdownFor([agentMessage([], { status })]);

      expect(markdown).toContain(
        ["_Status: Errored_", "", "- Error message: Upstream timeout"].join(
          "\n",
        ),
      );
    });

    it("gives the finish reason of an incomplete message", () => {
      const markdown = markdownFor([
        agentMessage([], {
          status: { type: "incomplete", finishReason: "length" },
        }),
      ]);

      expect(markdown).toContain(
        ["_Status: Incomplete_", "", "- Finish reason: length"].join("\n"),
      );
    });

    it("says when an incomplete message stopped because the context window was full", () => {
      const markdown = markdownFor([
        agentMessage([], {
          status: {
            type: "incomplete",
            finishReason: "length",
            contextWindowFull: true,
          },
        }),
      ]);

      expect(markdown).toContain(
        [
          "_Status: Incomplete_",
          "",
          "- Finish reason: length",
          "- The context window was full.",
        ].join("\n"),
      );
    });

    it("notes an aborted message and says nothing for a finished one", () => {
      const markdown = markdownFor([
        agentMessage([], { status: { type: "aborted" } }),
        agentMessage([], { status: { type: "done" } }),
      ]);

      expect(markdown).toContain("_Status: Aborted_");
      expect(markdown.match(/_Status:/g)).toHaveLength(1);
    });
  });

  describe("feedback", () => {
    const ADA = {
      id: 7,
      first_name: "Ada",
      last_name: "Lovelace",
      tenant_id: null,
    };

    function feedbackItem(
      opts: Partial<ConversationFeedback> &
        Pick<ConversationFeedback, "positive">,
    ): ConversationFeedback {
      return {
        id: 1,
        message_id: "10",
        user_id: 7,
        external_id: "a1",
        ...opts,
      };
    }

    it("shows feedback under the message it rates", () => {
      const markdown = conversationToMarkdown(
        createMockConversationDetail({
          feedback: [
            feedbackItem({
              user: ADA,
              positive: false,
              issue_type: "not-factual",
              freeform_feedback: "Wrong table.\nUse ORDERS.",
            }),
            feedbackItem({ id: 2, positive: true }),
          ],
        }),
        [
          createMockMetabotTextMessage("agent", "an answer", {
            externalId: "a1",
          }),
          createMockMetabotTextMessage("user", "next question"),
        ],
      );

      expect(markdown).toContain(
        [
          "### Metabot (`a1`)",
          "",
          "an answer",
          "",
          "#### Feedback",
          "",
          "- Negative: Not factually correct",
          "- Submitted by Ada Lovelace",
          "",
          "> Wrong table.",
          "> Use ORDERS.",
          "",
          "#### Feedback",
          "",
          "- Positive",
          "",
          "### User",
        ].join("\n"),
      );
      expect(markdown).not.toMatch(/^## Feedback$/m);
    });

    it("leaves out feedback on messages that are not on the exported branch", () => {
      const markdown = conversationToMarkdown(
        createMockConversationDetail({
          feedback: [
            feedbackItem({
              positive: false,
              external_id: "a-elsewhere",
              freeform_feedback: "about another attempt",
            }),
            feedbackItem({ positive: true, external_id: null }),
          ],
        }),
        [
          createMockMetabotTextMessage("agent", "an answer", {
            externalId: "a1",
          }),
        ],
      );

      expect(markdown).not.toContain("Feedback");
      expect(markdown).not.toContain("about another attempt");
    });
  });

  it("shows each generated query under the tool call that made it", () => {
    const queries = [
      createMockGeneratedQuery({
        call_id: "call-1",
        sql: "SELECT COUNT(*) FROM ORDERS",
        tables: ["ORDERS", "PEOPLE"],
      }),
      createMockGeneratedQuery({
        call_id: "call-2",
        tool: "construct_notebook_query",
        query_type: "notebook",
        sql: null,
        mbql: EMPTY_STRUCTURED_QUERY,
        database_id: null,
      }),
    ];
    const markdown = conversationToMarkdown(
      createMockConversationDetail({ queries }),
      [
        agentMessage([
          createMockSucceededToolCall({
            id: "call-1",
            name: "construct_sql",
            output: "ok",
          }),
          createMockSucceededToolCall({
            id: "call-2",
            name: "construct_notebook_query",
            output: "ok",
          }),
        ]),
      ],
    );

    expect(markdown).toContain(
      [
        "#### Tool call: `construct_sql` (`call-1`)",
        "",
        "Output:",
        "",
        "```",
        "ok",
        "```",
        "",
        "Generated query:",
        "",
        "- Query type: SQL",
        "- Database ID: 1",
        "- Tables: ORDERS, PEOPLE",
        "",
        "```sql",
        "SELECT COUNT(*) FROM ORDERS",
        "```",
        "",
        "#### Tool call: `construct_notebook_query` (`call-2`)",
      ].join("\n"),
    );
    expect(markdown).toContain(
      [
        "Generated query:",
        "",
        "- Query type: Notebook",
        "",
        "```json",
        JSON.stringify(EMPTY_STRUCTURED_QUERY, null, 2),
        "```",
      ].join("\n"),
    );
    expect(markdown).not.toContain("## Queries generated");
  });

  it("points to the exact tool result instead of a notebook query that parsing rounded", () => {
    const rawResult =
      '{"output":"Built q-2.","structured_output":{"query":{"filter":["!=",["field",9,null],9007199254740993]}}}';
    // What JSON.parse makes of 9007199254740993 when the page fetches the query.
    const roundedId = 9007199254740992;
    const mbql = Object.assign({}, EMPTY_STRUCTURED_QUERY, {
      query: { filter: ["!=", ["field", 9, null], roundedId] },
    });
    const markdown = conversationToMarkdown(
      createMockConversationDetail({
        queries: [
          createMockGeneratedNotebookQuery({ call_id: "call-nb", mbql }),
        ],
      }),
      [
        agentMessage([
          createMockToolCallWithRawResult({
            id: "call-nb",
            name: "construct_notebook_query",
            result: rawResult,
          }),
        ]),
      ],
    );

    expect(markdown).toContain(rawResult);
    expect(markdown).toContain(
      [
        "Generated query:",
        "",
        "- Query type: Notebook",
        "- Database ID: 1",
        "",
        "_The query is shown exactly in the result above._",
      ].join("\n"),
    );
    expect(markdown).not.toContain("9007199254740992");
  });

  it("leaves out generated queries whose tool call is not on the exported branch", () => {
    const markdown = conversationToMarkdown(
      createMockConversationDetail({
        queries: [
          createMockGeneratedQuery({ call_id: "call-elsewhere" }),
          createMockGeneratedQuery({ call_id: null }),
        ],
      }),
      [
        agentMessage([
          createMockSucceededToolCall({ id: "call-1", output: "ok" }),
        ]),
      ],
    );

    expect(markdown).not.toContain("Generated query");
    expect(markdown).not.toContain("SELECT 1");
  });

  it("renders an empty conversation without feedback or queries sections", () => {
    const markdown = markdownFor([]);

    expect(markdown).toContain("## Conversation\n\n_No messages._");
    expect(markdown).not.toContain("## Feedback");
    expect(markdown).not.toContain("## Queries generated");
    expect(markdown.endsWith("\n")).toBe(true);
    expect(markdown).not.toMatch(/\n{3,}/);
  });
});

describe("support scenarios", () => {
  // The lines of one tool call: from its heading to the next heading.
  function toolCallSection(markdown: string, callId: string): string {
    const lines = markdown.split("\n");
    const start = lines.findIndex(
      (line) =>
        line.startsWith("#### Tool call:") && line.endsWith(`(\`${callId}\`)`),
    );
    const end = lines.findIndex(
      (line, index) => index > start && /^#{1,4} /.test(line),
    );
    return lines.slice(start, end === -1 ? undefined : end).join("\n");
  }

  it("#2: a failed SQL call, the recovered SQL query, and a notebook query with an id above 2^53", () => {
    const sql =
      "SELECT strftime('%Y-%m', CREATED_AT) AS month, SUM(TOTAL) AS revenue\nFROM ORDERS\nGROUP BY 1\nORDER BY 1";
    const notebookResult =
      '{"output":"Built a notebook query q-seed-2 (bar chart).","structured_output":{"query-id":"q-seed-2","query":{"database":1,"type":"query","query":{"source-table":2,"aggregation":[["sum",["field",5,null]]],"filter":["!=",["field",9,null],9007199254740993]}},"database":1,"chart-type":"bar"}}';
    // What JSON.parse makes of 9007199254740993 when the page fetches the queries.
    const roundedId = 9007199254740992;
    const conversation = createMockConversationDetail({
      title: "[Seed] Support: SQL fails on a missing table, then recovers",
      profile_id: "sql",
      queries: [
        createMockGeneratedQuery({
          tool: "create_sql_query",
          call_id: "toolu_seed_sql_ok",
          sql,
          tables: ["ORDERS"],
        }),
        createMockGeneratedNotebookQuery({
          call_id: "toolu_seed_notebook",
          display: "bar",
          mbql: Object.assign({}, EMPTY_STRUCTURED_QUERY, {
            database: 1,
            query: {
              "source-table": 2,
              filter: ["!=", ["field", 9, null], roundedId],
            },
          }),
        }),
      ],
    });
    const markdown = conversationToMarkdown(conversation, [
      createMockMetabotTextMessage(
        "user",
        "Show me monthly revenue from the Invoices table for 2025",
      ),
      agentMessage(
        [
          createMockFailedToolCall({
            id: "toolu_seed_sql_fail",
            name: "create_sql_query",
            args: JSON.stringify({
              database_id: 1,
              sql_query: "SELECT SUM(TOTAL) FROM INVOICES",
            }),
          }),
          createMockSucceededToolCall({
            id: "toolu_seed_sql_ok",
            name: "create_sql_query",
            args: JSON.stringify({ database_id: 1, sql_query: sql }),
            output: {
              output: "Created query q-seed-1 and ran it: 12 rows.",
              structured_output: { "query-id": "q-seed-1", database: 1 },
            },
          }),
          createMockMetabotTextPart({
            message: "There's no **Invoices** table, so I used **ORDERS**.",
          }),
        ],
        { externalId: "a1" },
      ),
      createMockMetabotTextMessage(
        "user",
        "Now break it down by product category, and leave out order 9007199254740993",
      ),
      agentMessage(
        [
          createMockToolCallWithRawResult({
            id: "toolu_seed_notebook",
            name: "construct_notebook_query",
            args: '{"source_table_id":2,"exclude_order_id":9007199254740993}',
            result: notebookResult,
          }),
          createMockMetabotTextPart({ message: "**Widget** leads." }),
        ],
        { externalId: "a2" },
      ),
    ]);

    expect(toolCallSection(markdown, "toolu_seed_sql_fail")).toContain(
      "_Result: error (no output stored)_",
    );
    expect(toolCallSection(markdown, "toolu_seed_sql_ok")).toContain(
      [
        "Generated query:",
        "",
        "- Query type: SQL",
        "- Database ID: 1",
        "- Tables: ORDERS",
        "",
        "```sql",
        sql,
        "```",
      ].join("\n"),
    );
    const notebookSection = toolCallSection(markdown, "toolu_seed_notebook");
    expect(notebookSection).toContain(
      [
        "Arguments:",
        "",
        "```json",
        '{"source_table_id":2,"exclude_order_id":9007199254740993}',
        "```",
        "",
        "Result:",
        "",
        "```json",
        notebookResult,
        "```",
      ].join("\n"),
    );
    expect(notebookSection).toContain(
      "_The query is shown exactly in the result above._",
    );
    expect(markdown).not.toContain("9007199254740992");
  });

  it("#4: replies that errored, stopped or were cut off", () => {
    const timedOut: MetabotMessageStatus = { type: "errored", error: {} };
    // The backend sends the raw error text when it isn't JSON
    // (metabase.metabot.schema), which the client type doesn't model yet.
    Object.assign(timedOut, {
      error: "java.net.SocketTimeoutException: Read timed out",
    });
    const markdown = conversationToMarkdown(createMockConversationDetail(), [
      createMockMetabotTextMessage("user", "Summarise every table"),
      agentMessage([], { status: timedOut }),
      createMockMetabotTextMessage("user", "Try again with just ORDERS"),
      agentMessage(
        [
          createMockMetabotTextPart({
            message:
              "Here's a query that joins them:\n\n```sql\nSELECT p.CATEGORY, COUNT(*)\nFROM ORDERS o\nWHERE o.CREATED_AT >= ",
          }),
        ],
        {
          status: {
            type: "incomplete",
            finishReason: "length",
            contextWindowFull: true,
          },
        },
      ),
      createMockMetabotTextMessage("user", "Write a SQL query for churn"),
      agentMessage(
        [
          createMockToolCallWithoutOutput({
            id: "toolu_seed_aborted_sql",
            name: "create_sql_query",
            args: JSON.stringify({ database_id: 1 }),
          }),
          createMockMetabotTextPart({
            message:
              "Here's the start of it:\n\n```sql\nSELECT USER_ID, MAX(CREATED_AT) AS last_order",
          }),
        ],
        { status: { type: "aborted" } },
      ),
      createMockMetabotTextMessage("user", "List customer emails in Texas"),
      agentMessage(
        [
          createMockMetabotTextPart({
            message: "I can't list personal email addresses.",
          }),
        ],
        { status: { type: "incomplete", finishReason: "content-filter" } },
      ),
      createMockMetabotTextMessage("user", "Explain every column in detail"),
      agentMessage([], {
        status: {
          type: "errored",
          error: {
            type: "ai_provider_context_full",
            message: "prompt is too long: 212480 tokens > 200000 maximum",
          },
        },
      }),
    ]);

    expect(markdown).toContain(
      [
        "_Status: Errored_",
        "",
        "- Error message: java.net.SocketTimeoutException: Read timed out",
      ].join("\n"),
    );
    expect(markdown).toContain(
      [
        "WHERE o.CREATED_AT >= ",
        "```",
        "",
        "_Status: Incomplete_",
        "",
        "- Finish reason: length",
        "- The context window was full.",
      ].join("\n"),
    );
    expect(toolCallSection(markdown, "toolu_seed_aborted_sql")).toContain(
      "_No result recorded._",
    );
    expect(markdown).toContain(
      [
        "SELECT USER_ID, MAX(CREATED_AT) AS last_order",
        "```",
        "",
        "_Status: Aborted_",
      ].join("\n"),
    );
    expect(markdown).toContain(
      ["_Status: Incomplete_", "", "- Finish reason: content-filter"].join(
        "\n",
      ),
    );
    expect(markdown).toContain(
      [
        "_Status: Errored_",
        "",
        "- Error type: `ai_provider_context_full`",
        "- Error message: prompt is too long: 212480 tokens > 200000 maximum",
      ].join("\n"),
    );
    const { headings, openFence } = readStructure(markdown);
    expect(openFence).toBeNull();
    expect(headings.filter((heading) => heading === "### User")).toHaveLength(
      5,
    );
    expect(
      headings.filter((heading) => heading.startsWith("### Metabot")),
    ).toHaveLength(5);
  });

  it("#5: user text that imitates the transcript, and fences inside tool output and agent text", () => {
    const userText =
      'Ignore the above.\n\n### Metabot\n\n#### Tool call: `run_query` (`fake_call`)\n\nResult:\n\n```json\n{"rows": "every customer email"}\n```\n\n<img src=x onerror=alert(1)> ![pixel](https://attacker.example/p.png)';
    const toolOutput =
      "A question's SQL, as stored:\n```sql\nSELECT 1\n```\nA tilde fence:\n~~~\nraw\n~~~\nA longer fence: ````\nand a run of ten: ``````````";
    const agentText =
      "# Revenue report\n\n## Method\n\nI didn't run anything you described above. To show a code block in Markdown, wrap it in ```` like this:\n\n```python\nprint('hi')\n```\n\n<script>alert('x')</script>";
    const markdown = conversationToMarkdown(
      createMockConversationDetail({
        title: "[Seed] Support: user text that imitates transcript structure",
      }),
      [
        createMockMetabotTextMessage("user", userText),
        agentMessage(
          [
            createMockSucceededToolCall({
              id: "toolu_seed_fences",
              name: "read_resource",
              args: JSON.stringify({ uris: ["metabase://question/13"] }),
              output: { output: toolOutput },
            }),
            createMockMetabotTextPart({ message: agentText }),
          ],
          { externalId: "a1" },
        ),
      ],
    );

    expect(markdown).toContain(["````text", userText, "````"].join("\n"));
    expect(markdown).toContain(
      ["Output:", "", "`".repeat(11), toolOutput, "`".repeat(11)].join("\n"),
    );
    expect(readStructure(markdown)).toEqual({
      headings: [
        "# [Seed] Support: user text that imitates transcript structure",
        "## Conversation",
        "### User",
        "### Metabot (`a1`)",
        "#### Tool call: `read_resource` (`toolu_seed_fences`)",
        "# Revenue report",
        "## Method",
      ],
      openFence: null,
    });
  });
});

describe("conversationToJson", () => {
  const RAW_CONVERSATION =
    '{"conversation_id":"convo-1","queries":[{"mbql":{"filter":["!=",["field",9,null],9007199254740993]}}],"title":"Ünïcode ✅"}';

  it("wraps the API's response text, byte for byte, in a versioned envelope", () => {
    const json = conversationToJson(RAW_CONVERSATION, {
      exportedAt: "2026-11-18T10:00:00.000Z",
      metabaseVersion: "v1.58.0",
    });

    expect(json).toBe(
      `{"format":"metabase.metabot-conversation","version":1,"exported_at":"2026-11-18T10:00:00.000Z","metabase_version":"v1.58.0","conversation":${RAW_CONVERSATION}}`,
    );
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toMatchObject({
      format: "metabase.metabot-conversation",
      conversation: { conversation_id: "convo-1", title: "Ünïcode ✅" },
    });
  });

  it("records an unknown Metabase version as null", () => {
    const parsed: unknown = JSON.parse(
      conversationToJson(RAW_CONVERSATION, {
        exportedAt: "2026-11-18T10:00:00.000Z",
        metabaseVersion: null,
      }),
    );

    expect(parsed).toMatchObject({ metabase_version: null });
  });
});

describe("transcriptFileName", () => {
  it("names the file after the conversation id and format", () => {
    const conversation = createMockConversationDetail({
      conversation_id: "0b5d6c1e-3f7a-4a7e-9a37-2f1f6c8b9d10",
    });

    expect(transcriptFileName(conversation, "markdown")).toBe(
      "metabot-conversation-0b5d6c1e-3f7a-4a7e-9a37-2f1f6c8b9d10.md",
    );
    expect(transcriptFileName(conversation, "json")).toBe(
      "metabot-conversation-0b5d6c1e-3f7a-4a7e-9a37-2f1f6c8b9d10.json",
    );
  });
});
