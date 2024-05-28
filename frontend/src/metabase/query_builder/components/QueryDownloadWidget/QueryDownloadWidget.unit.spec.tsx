import userEvent from "@testing-library/user-event";

import { setupCardQueryDownloadEndpoint } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS_ID, SAMPLE_DB_ID } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import QueryDownloadWidget from "./QueryDownloadWidget";

const TEST_CARD = createMockCard({
  dataset_query: createMockStructuredDatasetQuery({
    database: SAMPLE_DB_ID,
    query: {
      "source-table": ORDERS_ID,
    },
  }),
});

const TEST_RESULT = createMockDataset();

interface SetupOpts {
  card?: Card;
  result?: Dataset;
}

const setup = ({ card = TEST_CARD, result = TEST_RESULT }: SetupOpts = {}) => {
  const state = createMockState({
    entities: createMockEntitiesState({
      questions: [card],
    }),
  });

  const metadata = getMetadata(state);
  const question = checkNotNull(metadata.question(card.id));

  setupCardQueryDownloadEndpoint(card, "json");

  renderWithProviders(
    <QueryDownloadWidget question={question} result={result} />,
  );
};

describe("QueryDownloadWidget", () => {
  it("should display query export options", async () => {
    setup();

    await userEvent.click(getIcon("download"));
    await userEvent.unhover(getIcon("download"));

    expect(
      await screen.findByText("Download full results"),
    ).toBeInTheDocument();
  });
});
