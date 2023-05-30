import { screen } from "@testing-library/react";
import React from "react";

import _ from "underscore";
import {
  setupAlertsEndpoints,
  setupBookmarksEndpoints,
  setupCardDataset,
  setupCardEndpoints,
  setupCardQueryEndpoints,
  setupDatabasesEndpoints,
  setupModelIndexEndpoints,
  setupSearchEndpoints,
  setupTimelinesEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { Card, Dataset } from "metabase-types/api";
import {
  createMockCard,
  createMockDataset,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { checkNotNull } from "metabase/core/utils/types";
import DatasetQueryEditor from "metabase/query_builder/components/DatasetEditor/DatasetQueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import NativeQuery from "metabase-lib/queries/NativeQuery";
import Metadata from "metabase-lib/metadata/Metadata";

const TEST_DB = createSampleDatabase();
const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
  }),
});

interface SetupOpts {
  card?: Card;
  dataset?: Dataset;
  isActive: boolean;
}

function makeQuery(metadata: Metadata) {
  return new NativeQuery(
    checkNotNull(metadata.database(TEST_DB.id)).question(),
    {
      type: "native",
      database: TEST_DB.id,
      native: {
        query: "select * from orders",
        "template-tags": undefined,
      },
    },
  );
}

const setup = async ({
  card = TEST_NATIVE_CARD,
  dataset = createMockDataset(),
  isActive,
}: SetupOpts) => {
  setupDatabasesEndpoints([TEST_DB]);
  setupCardDataset(dataset);
  setupCardEndpoints(card);
  setupCardQueryEndpoints(card, dataset);
  setupSearchEndpoints([]);
  setupAlertsEndpoints(card, []);
  setupBookmarksEndpoints([]);
  setupTimelinesEndpoints([]);
  setupModelIndexEndpoints(card.id, []);

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });

  const metadata = getMetadata(storeInitialState);
  const query = makeQuery(metadata);
  const question = checkNotNull(metadata.question(card.id));

  renderWithProviders(
    <DatasetQueryEditor
      isActive={isActive}
      height={300}
      query={query}
      question={question}
      readOnly={false}
      onResizeStop={_.noop}
    />,
  );
};

describe("DatasetQueryEditor", () => {
  it("renders sidebar when query tab is active", async () => {
    await setup({ isActive: true });

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();
  });

  it("does not render sidebar when query tab is inactive", async () => {
    await setup({ isActive: false });

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();
  });
});
