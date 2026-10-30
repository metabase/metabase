jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import { type ReactElement, useState } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupSearchEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import {
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import { MetabotChainOfThought } from "metabase/metabot/components/MetabotChat/MetabotChainOfThought";
import { MetabotProvider } from "metabase/metabot/context";
import {
  erroredResponse,
  lastReqBody,
  mockAgentEndpoint,
} from "metabase/metabot/tests/utils";
import { getDiffControls } from "metabase/querying/components/CodeMirrorEditor/test-utils";
import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor/NativeQueryEditor";
import { checkNotNull } from "metabase/utils/types";
import type Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockDatabase,
  createMockNativeDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { MetabotPromptButton } from "../MetabotPromptButton";

import { useInlineSQLPrompt } from "./useInlineSQLPrompt";

jest.mock(
  "metabase/querying/components/NativeQueryEditor/use-notebook-screen-size",
  () => ({
    useNotebookScreenSize: jest.fn(() => "large"),
  }),
);

const TEST_DB = createSampleDatabase();

const OTHER_DB = createMockDatabase({ id: 2, name: "Other Database" });

const TEST_CARD = createMockCard({
  id: 1,
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
    native: { query: "SELECT 1" },
  }),
});

const OTHER_DB_CARD = createMockCard({
  id: 2,
  dataset_query: createMockNativeDatasetQuery({
    database: OTHER_DB.id,
    native: { query: "SELECT 1" },
  }),
});

const CODE_EDIT_RESPONSE: SSEEvent[] = [
  {
    type: "data-code_edit",
    data: { buffer_id: "qb", mode: "rewrite", value: "SELECT 2" },
  },
];

// At 10 ms per paced word, this reasoning takes at least 15 s to replay.
const LONG_REASONING_WORD_COUNT = 1500;
// Keep it at most a third of the replay time above, and below the 30 s jest timeout.
const SQL_ARRIVAL_TIMEOUT_MS = 5000;

const codeEditResponse = (sql: string): SSEEvent[] => [
  { type: "start", messageId: `msg-${sql}` },
  {
    type: "data-code_edit",
    data: { buffer_id: "qb", mode: "rewrite", value: sql },
  },
];

const TEXT_ONLY_RESPONSE: SSEEvent[] = [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: "I can help with that!" },
  { type: "text-end", id: "t1" },
];

const LONG_REASONING_THEN_CODE_EDIT_RESPONSE: SSEEvent[] = [
  { type: "reasoning-start", id: "r1" },
  {
    type: "reasoning-delta",
    id: "r1",
    delta: "word ".repeat(LONG_REASONING_WORD_COUNT),
  },
  { type: "reasoning-end", id: "r1" },
  ...CODE_EDIT_RESPONSE,
];

const OTHER_CONVERSATION_REASONING = (
  <MetabotChainOfThought
    conversationId="other-conversation"
    part={{
      id: "chain-1",
      role: "agent",
      type: "chain_of_thought",
      steps: [{ kind: "reasoning", text: "Weighing the join order" }],
      finished: false,
    }}
  />
);

function TestEditor({ question }: { question: Question }) {
  const {
    extensions,
    portalElement,
    togglePrompt,
    isPromptOpen,
    proposedQuestion,
    handleAcceptProposed,
    handleRejectProposed,
  } = useInlineSQLPrompt(question, "qb");
  const [currentQuestion, setCurrentQuestion] = useState(question);
  const query = checkNotNull(currentQuestion.legacyNativeQuery());

  return (
    <>
      <NativeQueryEditor
        question={currentQuestion}
        query={query}
        proposedQuestion={proposedQuestion}
        setDatasetQuery={(nextQuery) =>
          setCurrentQuestion(
            currentQuestion.setDatasetQuery(nextQuery.datasetQuery()),
          )
        }
        onAcceptProposed={handleAcceptProposed}
        onRejectProposed={handleRejectProposed}
        isNativeEditorOpen
        isInitiallyOpen
        extensions={extensions}
      >
        <NativeQueryEditor.TopBar>
          <NativeQueryEditor.Sidebar
            promptButton={
              <MetabotPromptButton
                isPromptInputOpen={isPromptOpen}
                onClick={togglePrompt}
              />
            }
          />
        </NativeQueryEditor.TopBar>
      </NativeQueryEditor>
      {portalElement}
      <output data-testid="proposed-sql">
        {proposedQuestion?.legacyNativeQuery()?.queryText()}
      </output>
    </>
  );
}

function TestPage({
  questions,
}: {
  questions: { initial: Question; otherDatabase: Question };
}) {
  const [question, setQuestion] = useState(questions.initial);
  const [pageKey, setPageKey] = useState(0);

  return (
    <>
      <TestEditor key={pageKey} question={question} />
      <button onClick={() => setQuestion(questions.otherDatabase)}>
        Switch database
      </button>
      <button onClick={() => setPageKey((key) => key + 1)}>
        Open new SQL page
      </button>
    </>
  );
}

interface SetupOpts {
  isMetabotEnabled?: boolean;
  otherContent?: ReactElement;
}

function setup({ isMetabotEnabled = true, otherContent }: SetupOpts = {}) {
  setupEnterprisePlugins();
  setupDatabasesEndpoints([TEST_DB, OTHER_DB]);
  setupUserMetabotPermissionsEndpoint();
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();
  setupSearchEndpoints([]);

  const state = createMockState({
    settings: mockSettings({
      "metabot-enabled?": isMetabotEnabled,
      "llm-metabot-configured?": true,
    }),
    currentUser: createMockUser(),
    entities: createMockEntitiesState({
      databases: [TEST_DB, OTHER_DB],
      questions: [TEST_CARD, OTHER_DB_CARD],
    }),
  });
  const metadata = createMockMetadataFromState(state);
  const questions = {
    initial: checkNotNull(metadata.question(TEST_CARD.id)),
    otherDatabase: checkNotNull(metadata.question(OTHER_DB_CARD.id)),
  };

  renderWithProviders(
    <MetabotProvider>
      <TestPage questions={questions} />
      {otherContent}
    </MetabotProvider>,
    { storeInitialState: state },
  );
}

async function openOtherConversationReasoning() {
  const header = await screen.findByTestId("metabot-chain-of-thought-header");
  await userEvent.click(header);
  const stepToggle = await waitFor(() =>
    checkNotNull(
      screen
        .getAllByRole("button", { name: /Thinking/ })
        .find((button) => button !== header),
    ),
  );
  await userEvent.click(stepToggle);
  expect(stepToggle).toHaveAttribute("aria-expanded", "true");
}

async function startGenerating() {
  expect(await screen.findByText("SELECT")).toBeInTheDocument();
  await userEvent.click(await screen.findByLabelText("Ask Metabot"));
  const prompt = await screen.findByTestId("metabot-inline-sql-prompt");
  await userEvent.type(within(prompt).getByRole("textbox"), "count orders");
  await userEvent.click(
    within(prompt).getByRole("button", { name: "Send to Metabot" }),
  );
  expect(await within(prompt).findByRole("status")).toHaveTextContent(
    "Working on it...",
  );
  return prompt;
}

function editorContent() {
  return checkNotNull(document.querySelector<HTMLElement>(".cm-content"));
}

async function openPrompt() {
  const button = await screen.findByLabelText("Ask Metabot");
  if (button.getAttribute("aria-pressed") !== "true") {
    await userEvent.click(button);
  }
  return screen.findByTestId("metabot-inline-sql-prompt");
}

async function sendPrompt(text: string) {
  const prompt = await openPrompt();
  await userEvent.type(within(prompt).getByRole("textbox"), text);
  await userEvent.click(
    within(prompt).getByRole("button", { name: "Send to Metabot" }),
  );
  return prompt;
}

type AgentEndpointMock = ReturnType<typeof mockAgentEndpoint>;

// Re-spying on an already mocked fetch would route other requests back into the
// mock, so restore the previous mock before setting the next response.
async function generateSql({
  previousAgent,
  prompt,
  sql,
}: {
  previousAgent?: AgentEndpointMock;
  prompt: string;
  sql: string;
}) {
  previousAgent?.mockRestore();
  const agent = mockAgentEndpoint({ events: codeEditResponse(sql) });
  await sendPrompt(prompt);
  await waitFor(() => expect(getDiffControls().row).toBeInTheDocument());
  const body: unknown = await lastReqBody(agent);
  return { agent, body };
}

// CodeMirror resolves a shifted letter binding from `keyCode`, which
// `userEvent.keyboard` does not set.
function pressPromptShortcut(target: HTMLElement) {
  fireEvent.keyDown(target, {
    key: "I",
    code: "KeyI",
    keyCode: 73,
    ctrlKey: true,
    shiftKey: true,
  });
}

function queryDiffControls() {
  return document.querySelector(".cm-diff-controls");
}

async function expectProposedSqlSoon() {
  await waitFor(
    () => {
      expect(
        screen.queryByTestId("metabot-inline-sql-prompt"),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Working on it...")).not.toBeInTheDocument();
      expect(screen.getByTestId("proposed-sql")).toHaveTextContent("SELECT 2");
    },
    { timeout: SQL_ARRIVAL_TIMEOUT_MS },
  );
}

describe("useInlineSQLPrompt", () => {
  it("toggles the inline prompt open and closed", async () => {
    setup();

    expect(await screen.findByText("SELECT")).toBeInTheDocument();
    const button = await screen.findByLabelText("Ask Metabot");
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.queryByTestId("metabot-inline-sql-prompt"),
    ).not.toBeInTheDocument();

    await userEvent.click(button);
    expect(
      await screen.findByTestId("metabot-inline-sql-prompt"),
    ).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(button);
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-inline-sql-prompt"),
      ).not.toBeInTheDocument();
    });
    expect(button).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(button);
    await userEvent.click(
      await screen.findByTestId("metabot-inline-sql-cancel"),
    );
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-inline-sql-prompt"),
      ).not.toBeInTheDocument();
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("shows that Metabot is working until the SQL arrives", async () => {
    const agent = mockAgentEndpoint({
      events: CODE_EDIT_RESPONSE,
      waitForResponse: true,
    });
    setup();

    await startGenerating();

    agent.sendResponse();
    await waitFor(() => {
      expect(screen.queryByText("Working on it...")).not.toBeInTheDocument();
    });
  });

  // https://github.com/metabase/metabase/issues/84969
  it("shows the SQL soon after a stream with long reasoning", async () => {
    const agent = mockAgentEndpoint({
      events: LONG_REASONING_THEN_CODE_EDIT_RESPONSE,
      waitForResponse: true,
    });
    setup();

    await startGenerating();

    agent.sendResponse();
    await expectProposedSqlSoon();
  });

  it("keeps the SQL fast while another conversation shows open reasoning", async () => {
    const agent = mockAgentEndpoint({
      events: LONG_REASONING_THEN_CODE_EDIT_RESPONSE,
      waitForResponse: true,
    });
    setup({ otherContent: OTHER_CONVERSATION_REASONING });

    await openOtherConversationReasoning();
    await startGenerating();

    agent.sendResponse();
    await expectProposedSqlSoon();
  });

  it("replaces the working status with the error when generation fails", async () => {
    const agent = mockAgentEndpoint({
      events: erroredResponse,
      waitForResponse: true,
    });
    setup();

    const prompt = await startGenerating();

    agent.sendResponse();
    expect(
      await within(prompt).findByText(
        "Sorry, I ran into an error. Could you please try that again?",
      ),
    ).toBeInTheDocument();
    expect(within(prompt).queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces the working status with the interruption notice when generation is stopped", async () => {
    mockAgentEndpoint({ stream: new ReadableStream<Uint8Array>() });
    setup();

    const prompt = await startGenerating();

    await userEvent.click(
      within(prompt).getByRole("button", { name: "Stop generating" }),
    );
    expect(
      await within(prompt).findByText("Response from Metabot was interrupted"),
    ).toBeInTheDocument();
    expect(within(prompt).queryByRole("status")).not.toBeInTheDocument();
  });

  it("opens and closes the prompt with the keyboard shortcut", async () => {
    setup();

    expect(await screen.findByLabelText("Ask Metabot")).toBeInTheDocument();
    await userEvent.click(editorContent());
    pressPromptShortcut(editorContent());
    const prompt = await screen.findByTestId("metabot-inline-sql-prompt");

    pressPromptShortcut(within(prompt).getByRole("textbox"));
    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-inline-sql-prompt"),
      ).not.toBeInTheDocument();
    });
  });

  it("sends the SQL editor as context of the request", async () => {
    const agent = mockAgentEndpoint({ events: CODE_EDIT_RESPONSE });
    setup();

    await sendPrompt("select all users");

    const body: unknown = await lastReqBody(agent);
    expect(body).toMatchObject({
      context: {
        user_is_viewing: [
          {
            type: "code_editor",
            buffers: [
              {
                id: "qb",
                source: { language: "sql", database_id: TEST_DB.id },
              },
            ],
          },
        ],
      },
    });
  });

  it("shows the generated SQL as a diff and applies it on accept", async () => {
    setup();

    await generateSql({ prompt: "select all users", sql: "SELECT 2" });

    expect(
      screen.queryByTestId("metabot-inline-sql-prompt"),
    ).not.toBeInTheDocument();
    expect(editorContent()).toHaveTextContent("SELECT 1");
    expect(editorContent()).toHaveTextContent("SELECT 2");

    await userEvent.click(
      within(getDiffControls().row).getByRole("button", { name: /Accept/ }),
    );

    await waitFor(() => expect(queryDiffControls()).not.toBeInTheDocument());
    expect(editorContent()).toHaveTextContent("SELECT 2");
    expect(editorContent()).not.toHaveTextContent("SELECT 1");
  });

  it("cancels the in-flight request when the prompt is closed", async () => {
    const agent = mockAgentEndpoint({
      stream: new ReadableStream<Uint8Array>(),
    });
    setup();

    const prompt = await startGenerating();
    await userEvent.click(
      within(prompt).getByTestId("metabot-inline-sql-cancel"),
    );

    await waitFor(() => {
      expect(
        screen.queryByTestId("metabot-inline-sql-prompt"),
      ).not.toBeInTheDocument();
    });
    const [request] = checkNotNull(agent.mock.calls.at(-1));
    expect(request).toBeInstanceOf(Request);
    expect(request instanceof Request && request.signal.aborted).toBe(true);
    expect(queryDiffControls()).not.toBeInTheDocument();
  });

  it("shows an error when the response has no SQL", async () => {
    mockAgentEndpoint({ events: TEXT_ONLY_RESPONSE });
    setup();

    const prompt = await sendPrompt("do something");

    expect(
      await within(prompt).findByTestId("metabot-inline-sql-error"),
    ).toHaveTextContent(
      "Sorry, I ran into an error. Could you please try that again?",
    );
    expect(screen.getByTestId("proposed-sql")).toBeEmptyDOMElement();
  });

  it("restores the SQL on reject and sends the rejection with the next prompt", async () => {
    setup();

    const { agent } = await generateSql({
      prompt: "select all users",
      sql: "SELECT * FROM users",
    });
    await userEvent.click(
      within(getDiffControls().row).getByRole("button", { name: /Reject/ }),
    );

    await waitFor(() => expect(queryDiffControls()).not.toBeInTheDocument());
    expect(editorContent()).toHaveTextContent("SELECT 1");
    expect(editorContent()).not.toHaveTextContent("SELECT * FROM users");

    const { body } = await generateSql({
      previousAgent: agent,
      prompt: "try again",
      sql: "SELECT id FROM users",
    });
    expect(body).toMatchObject({
      parent_message_id: expect.any(String),
      message: expect.stringContaining(
        "User rejected the following suggestion:\n\nSELECT * FROM users",
      ),
    });
  });

  it("keeps the prompt open and starts a new conversation when the database changes", async () => {
    setup();

    const { agent } = await generateSql({
      prompt: "select all users",
      sql: "SELECT 2",
    });
    await userEvent.click(
      within(getDiffControls().row).getByRole("button", { name: /Reject/ }),
    );
    await openPrompt();

    await userEvent.click(
      screen.getByRole("button", { name: "Switch database" }),
    );
    expect(screen.getByTestId("metabot-inline-sql-prompt")).toBeInTheDocument();

    const { body } = await generateSql({
      previousAgent: agent,
      prompt: "select something",
      sql: "SELECT 123",
    });
    expect(body).not.toHaveProperty("parent_message_id");
  });

  it("starts a new conversation on a new SQL page", async () => {
    setup();

    const { agent } = await generateSql({
      prompt: "select all users",
      sql: "SELECT 2",
    });
    await userEvent.click(
      within(getDiffControls().row).getByRole("button", { name: /Accept/ }),
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Open new SQL page" }),
    );

    const { body } = await generateSql({
      previousAgent: agent,
      prompt: "new prompt",
      sql: "SELECT 456",
    });
    expect(body).not.toHaveProperty("parent_message_id");
  });

  it("dismisses the proposal when the SQL is edited by hand", async () => {
    setup();

    await generateSql({ prompt: "select all users", sql: "SELECT 2" });

    await userEvent.type(editorContent(), " ");

    await waitFor(() => expect(queryDiffControls()).not.toBeInTheDocument());
    expect(screen.getByTestId("proposed-sql")).toBeEmptyDOMElement();
  });

  it("does not render when metabot is not enabled", async () => {
    setup({ isMetabotEnabled: false });

    expect(await screen.findByLabelText("Auto-format")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask Metabot")).not.toBeInTheDocument();
  });
});
