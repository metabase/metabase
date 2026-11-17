import userEvent from "@testing-library/user-event";

import { createMockMetadataFromState } from "__support__/metadata";
import {
  setupCardQueryDownloadEndpoint,
  setupLastDownloadFormatEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { getIcon, renderWithProviders, screen } from "__support__/ui";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import Question from "metabase-lib/v1/Question";
import type { Card, Dataset } from "metabase-types/api";
import { createMockCard, createMockDataset } from "metabase-types/api/mocks";

import { QuestionDownloadPopover } from "./QuestionDownloadPopover";

const TEST_CARD = createMockCard({
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
  ),
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

  const metadata = createMockMetadataFromState(state);
  const question = new Question(card, metadata);

  setupCardQueryDownloadEndpoint(card, "json");

  setupLastDownloadFormatEndpoints();

  renderWithProviders(
    <QuestionDownloadPopover question={question} result={result} />,
  );
};

describe("QuestionDownloadPopover", () => {
  it("should display query export options", async () => {
    setup();

    await userEvent.click(getIcon("download"));

    expect(
      await screen.findByRole("heading", { name: /download/i }),
    ).toBeInTheDocument();
  });
});
