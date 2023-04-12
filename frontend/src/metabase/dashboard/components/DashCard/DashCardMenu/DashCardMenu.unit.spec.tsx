import React from "react";
import userEvent from "@testing-library/user-event";
import { checkNotNull } from "metabase/core/utils/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import {
  createSampleDatabase,
  ORDERS_ID,
  SAMPLE_DB_ID,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { setupCardQueryDownloadEndpoint } from "__support__/server-mocks";
import { createEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import DashCardMenu from "./DashCardMenu";

const TEST_CARD = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_CARD_UNAUTHORIZED = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
  }),
});

const TEST_RESULT = createMockDataset();

const TEST_RESULT_ERROR = createMockDataset({
  error: "An error occurred",
});

interface SetupOpts {
  card?: Card;
  result?: Dataset;
}

const setup = ({ card = TEST_CARD, result = TEST_RESULT }: SetupOpts = {}) => {
  const state = createMockState({
    entities: createEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));

  setupCardQueryDownloadEndpoint(card, "json");

  renderWithProviders(<DashCardMenu question={question} result={result} />);
};

describe("DashCardMenu", () => {
  it("should display a link to the notebook editor", async () => {
    setup();

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
  });

  it("should not display a link to the notebook editor if the user does not have permissions", async () => {
    setup({ card: TEST_CARD_UNAUTHORIZED });

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Download results")).toBeInTheDocument();
    expect(screen.queryByText("Edit question")).not.toBeInTheDocument();
  });

  it("should display query export options", async () => {
    setup();

    userEvent.click(getIcon("ellipsis"));
    userEvent.click(await screen.findByText("Download results"));

    expect(screen.getByText("Download full results")).toBeInTheDocument();
  });

  it("should not display query export options when there is a query error", async () => {
    setup({ result: TEST_RESULT_ERROR });

    userEvent.click(getIcon("ellipsis"));

    expect(await screen.findByText("Edit question")).toBeInTheDocument();
    expect(screen.queryByText("Download results")).not.toBeInTheDocument();
  });
});
