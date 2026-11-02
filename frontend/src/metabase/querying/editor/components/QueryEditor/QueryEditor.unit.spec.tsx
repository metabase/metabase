import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupAdhocQueryMetadataEndpoint,
  setupCardDataset,
} from "__support__/server-mocks/dataset";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockEntitiesState } from "metabase/metadata-store";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { QueryEditorUiState } from "../../types";

import { QueryEditor, type QueryEditorProps } from "./QueryEditor";

const TEST_CARD = createMockCard({
  dataset_query: {
    type: "query",
    query: { "source-table": ORDERS_ID },
    database: SAMPLE_DB_ID,
  },
});

interface SetupOpts {
  card?: Card;
}

function TestableQueryEditor({ query }: Pick<QueryEditorProps, "query">) {
  const [uiState, setUiState] = useState<QueryEditorUiState>({
    lastRunResult: null,
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    modalType: null,
    sidebarType: null,
  });

  return (
    <QueryEditor
      query={query}
      uiState={uiState}
      uiOptions={{}}
      onChangeQuery={() => {}}
      onChangeUiState={setUiState}
      parametersList={null}
      templateTagsSidebar={() => null}
    />
  );
}

const setup = ({ card = TEST_CARD }: SetupOpts) => {
  const db = createSampleDatabase();
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [db],
      questions: [card],
    }),
  });
  const metadata = createMockMetadataFromState(storeInitialState);
  const question = new Question(card, metadata);
  const query = question.query();

  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata({}));
  setupCardDataset({});

  renderWithProviders(<TestableQueryEditor query={query} />, {
    storeInitialState,
  });

  return {};
};

describe("QueryEditor", () => {
  it("shows a refresh button once fetched", async () => {
    setup({});

    expect(
      screen.queryByRole("button", { name: "Refresh" }),
    ).not.toBeInTheDocument();

    await userEvent.click(await screen.findByTestId("run-button"));

    expect(
      await screen.findByRole("button", {
        name: "Refresh",
      }),
    ).toBeInTheDocument();
  });
});
