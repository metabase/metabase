jest.unmock("@uiw/react-codemirror");

import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionsEndpoints,
  setupNativeQuerySnippetEndpoints,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { MetabotProvider } from "metabase/metabot/context";
import { getMetadata } from "metabase/metadata-store";
import { NativeQueryEditor } from "metabase/querying/components/NativeQueryEditor/NativeQueryEditor";
import { checkNotNull } from "metabase/utils/types";
import type Question from "metabase-lib/v1/Question";
import {
  createMockCard,
  createMockNativeDatasetQuery,
  createMockUser,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

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

function TestEditor({ question }: { question: Question }) {
  const { extensions, portalElement, togglePrompt, isPromptOpen } =
    useInlineSQLPrompt(question, "qb");
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
        isPromptInputOpen={isPromptOpen}
        onTogglePromptInput={togglePrompt}
      >
        <NativeQueryEditor.TopBar>
          <NativeQueryEditor.Sidebar />
        </NativeQueryEditor.TopBar>
      </NativeQueryEditor>
      {portalElement}
    </>
  );
}

function setup({ isMetabotEnabled = true } = {}) {
  setupEnterprisePlugins();
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
  const question = checkNotNull(getMetadata(state).question(TEST_CARD.id));

  renderWithProviders(
    <MetabotProvider>
      <TestEditor question={question} />
    </MetabotProvider>,
    { storeInitialState: state },
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

  it("does not render when metabot is not enabled", async () => {
    setup({ isMetabotEnabled: false });

    expect(await screen.findByLabelText("Auto-format")).toBeInTheDocument();
    expect(screen.queryByLabelText("Ask Metabot")).not.toBeInTheDocument();
  });
});
