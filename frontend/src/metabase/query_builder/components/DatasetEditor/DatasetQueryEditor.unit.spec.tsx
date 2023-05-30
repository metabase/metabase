import { screen } from "@testing-library/react";
import fetchMock from "fetch-mock";
import React from "react";
import _ from "underscore";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders } from "__support__/ui";
import { Card, Collection } from "metabase-types/api";
import {
  createMockCard,
  createMockNativeDatasetQuery,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";
import { checkNotNull } from "metabase/core/utils/types";
import DatasetQueryEditor from "metabase/query_builder/components/DatasetEditor/DatasetQueryEditor";
import { getMetadata } from "metabase/selectors/metadata";
import NativeQuery from "metabase-lib/queries/NativeQuery";

const TEST_DB = createSampleDatabase();

const TEST_NATIVE_CARD = createMockCard({
  dataset_query: createMockNativeDatasetQuery({
    database: TEST_DB.id,
  }),
});

const ROOT_COLLECTION = {
  id: "root",
  name: "Our analytics",
  can_write: true,
} as Collection;

interface SetupOpts {
  card?: Card;
}

const setup = async ({ card = TEST_NATIVE_CARD }: SetupOpts = {}) => {
  setupDatabasesEndpoints([TEST_DB]);

  const storeInitialState = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
      questions: [card],
    }),
  });
  const metadata = getMetadata(storeInitialState);
  const query = new NativeQuery(
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
  const question = checkNotNull(metadata.question(card.id));

  return { query, question };
};

describe("DatasetQueryEditor", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/collection", [ROOT_COLLECTION]);
    fetchMock.get("path:/api/native-query-snippet", () => []);
  });

  it("renders sidebar when query tab is active", async () => {
    const { query, question } = await setup();

    renderWithProviders(
      <DatasetQueryEditor
        isActive={true}
        height={300}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
      />,
    );

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();
  });

  it("does not render sidebar when query tab is inactive", async () => {
    const { query, question } = await setup();

    renderWithProviders(
      <DatasetQueryEditor
        isActive={false}
        height={300}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
      />,
    );

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();
  });

  it("re-renders DatasetQueryEditor when isActive prop changes", async () => {
    const { query, question } = await setup();

    const { rerender } = renderWithProviders(
      <DatasetQueryEditor
        isActive={true}
        height={0}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
      />,
    );

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();

    rerender(
      <DatasetQueryEditor
        isActive={false}
        height={0}
        query={query}
        question={question}
        readOnly={false}
        onResizeStop={_.noop}
      />,
    );

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();
  });
});
