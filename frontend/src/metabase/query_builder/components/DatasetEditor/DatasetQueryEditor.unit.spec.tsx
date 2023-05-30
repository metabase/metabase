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
  height?: number;
  isActive: boolean;
  readOnly?: boolean;
}

const setup = ({
  card = TEST_NATIVE_CARD,
  height = 300,
  isActive,
  readOnly = false,
}: SetupOpts) => {
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

  const { rerender } = renderWithProviders(
    <DatasetQueryEditor
      isActive={isActive}
      height={height}
      query={query}
      question={question}
      readOnly={readOnly}
      onResizeStop={_.noop}
    />,
  );

  return { query, question, rerender };
};

describe("DatasetQueryEditor", () => {
  beforeEach(() => {
    fetchMock.get("path:/api/collection", [ROOT_COLLECTION]);
    fetchMock.get("path:/api/native-query-snippet", () => []);
  });

  it("renders sidebar when query tab is active", () => {
    setup({ isActive: true });

    expect(
      screen.getByTestId("native-query-editor-sidebar"),
    ).toBeInTheDocument();

    expect(screen.getByTestId("native-query-editor-container")).toBeVisible();
  });

  it("does not render sidebar when query tab is inactive", () => {
    setup({ isActive: false });

    expect(
      screen.queryByTestId("native-query-editor-sidebar"),
    ).not.toBeInTheDocument();

    expect(
      screen.getByTestId("native-query-editor-container"),
    ).not.toBeVisible();
  });

  it("re-renders DatasetQueryEditor when height is 0 and isActive prop changes", async () => {
    const { query, question, rerender } = await setup({
      height: 0,
      isActive: true,
    });

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
