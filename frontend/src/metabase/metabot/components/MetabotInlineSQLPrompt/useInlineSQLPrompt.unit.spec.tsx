jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCollectionsEndpoints,
  setupDatabasesEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { SSEEvent } from "metabase/api/ai-streaming/sse-types";
import { MetabotChainOfThought } from "metabase/metabot/components/MetabotChat/MetabotChainOfThought";
import { MetabotProvider } from "metabase/metabot/context";
import {
  erroredResponse,
  mockAgentEndpoint,
} from "metabase/metabot/tests/utils";
import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor/NativeQueryEditor";
import { checkNotNull } from "metabase/utils/types";
import type Question from "metabase-lib/v1/Question";
import {
  createMockCard,
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

const TEST_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
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
  } = useInlineSQLPrompt(question, "qb");
  const query = checkNotNull(question.legacyNativeQuery());

  return (
    <>
      <NativeQueryEditor
        question={question}
        query={query}
        setDatasetQuery={jest.fn()}
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

interface SetupOpts {
  isMetabotEnabled?: boolean;
  otherContent?: ReactElement;
}

function setup({ isMetabotEnabled = true, otherContent }: SetupOpts = {}) {
  setupEnterprisePlugins();
  setupDatabasesEndpoints([TEST_DB]);
  setupUserMetabotPermissionsEndpoint();
  setupCollectionsEndpoints({ collections: [] });
  setupNativeQuerySnippetEndpoints();

  const state = createMockState({
    settings: mockSettings({
      "metabot-enabled?": isMetabotEnabled,
      "llm-metabot-configured?": true,
    }),
    currentUser: createMockUser(),
    entities: createMockEntitiesState({
      databases: [TEST_DB],
      questions: [TEST_CARD],
    }),
  });
  const question = checkNotNull(
    createMockMetadataFromState(state).question(TEST_CARD.id),
  );

  renderWithProviders(
    <MetabotProvider>
      <TestEditor question={question} />
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

  it("does not render when metabot is not enabled", async () => {
    setup({ isMetabotEnabled: false });

    expect(await screen.findByLabelText("Auto-format")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask Metabot")).not.toBeInTheDocument();
  });
});
