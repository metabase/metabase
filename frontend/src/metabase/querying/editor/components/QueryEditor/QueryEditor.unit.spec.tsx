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
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockCardQueryMetadata,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import type { QueryEditorUiState } from "../../types";

import { QueryEditor, type QueryEditorProps } from "./QueryEditor";

const TEST_CARD = createMockCard({
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  }),
});

const TEST_CARD_WITH_AGGREGATION = createMockCard({
  dataset_query: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        aggregations: [{ type: "operator", operator: "count", args: [] }],
      },
    ],
  }),
});

function TestableQueryEditor({
  query,
  uiOptions,
}: Pick<QueryEditorProps, "query" | "uiOptions">) {
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
      uiOptions={uiOptions}
      onChangeQuery={() => {}}
      onChangeUiState={setUiState}
      parametersList={null}
      templateTagsSidebar={() => null}
    />
  );
}

interface SetupOpts {
  card?: Card;
  uiOptions?: QueryEditorProps["uiOptions"];
}

const setup = ({ card = TEST_CARD, uiOptions }: SetupOpts) => {
  const db = createSampleDatabase();
  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [db],
      questions: [card],
    }),
  });
  const metadata = createMockMetadataFromState(storeInitialState);
  const queryForCard = (card: Card) => {
    const question = new Question(card, metadata);
    return question.query();
  };

  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata({}));
  setupCardDataset({});

  const { rerender } = renderWithProviders(
    <TestableQueryEditor query={queryForCard(card)} uiOptions={uiOptions} />,
    {
      storeInitialState,
    },
  );

  return {
    rerenderWithCard(card: Card) {
      rerender(
        <TestableQueryEditor
          query={queryForCard(card)}
          uiOptions={uiOptions}
        />,
      );
    },
  };
};

describe("QueryEditor", () => {
  describe("refresh button", () => {
    it("does not show a refresh button in initial state", async () => {
      setup({});

      expect(
        screen.queryByRole("button", { name: "Refresh" }),
      ).not.toBeInTheDocument();
    });
    it("does not show a refresh button if read only", async () => {
      setup({ uiOptions: { readOnly: true } });
      await userEvent.click(await screen.findByTestId("run-button"));

      expect(
        screen.queryByRole("button", { name: "Refresh" }),
      ).not.toBeInTheDocument();
    });
    it("does not show a refresh button if run button hidden", async () => {
      setup({ uiOptions: { hideRunButton: true } });
      await userEvent.click(await screen.findByTestId("run-button"));

      expect(
        screen.queryByRole("button", { name: "Refresh" }),
      ).not.toBeInTheDocument();
    });
    it("shows a refresh button once fetched", async () => {
      setup({});
      await userEvent.click(await screen.findByTestId("run-button"));

      expect(
        await screen.findByRole("button", {
          name: "Refresh",
        }),
      ).toBeInTheDocument();
    });
    it("does not show a refresh button if dirty", async () => {
      const { rerenderWithCard } = setup({});
      await userEvent.click(await screen.findByTestId("run-button"));
      rerenderWithCard(TEST_CARD_WITH_AGGREGATION); // dirty the result
      expect(
        screen.queryByRole("button", { name: "Refresh" }),
      ).not.toBeInTheDocument();
    });
  });
});
