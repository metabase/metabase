import fetchMock from "fetch-mock";
import type * as React from "react";

import {
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import {
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { getNextId } from "__support__/utils";
import { Modal } from "metabase/ui";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDatabase,
} from "metabase-types/api/mocks";
import {
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createReviewsTable,
} from "metabase-types/api/mocks/presets";

import { TableOrModelActionPicker } from "./TableOrModelActionPicker";

const mockSearchItem = createMockCollectionItem({
  collection: createMockCollection(),
  model: "dataset",
});
const mockDb = createMockDatabase({ id: SAMPLE_DB_ID, name: "SampleDB" });
const mockDb2 = createMockDatabase({
  id: getNextId(SAMPLE_DB_ID),
  engine: "Postgres",
  name: "PostgresDB",
});
const mockTable = createOrdersTable({ db_id: mockDb.id });
const mockTable2 = createPeopleTable({ db_id: mockDb.id });
const mockTable3 = createProductsTable({ db_id: mockDb.id });
const mockTable4 = createReviewsTable({ db_id: mockDb2.id });

describe("TableOrModelActionPicker", () => {
  beforeEach(() => {
    mockGetBoundingClientRect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should render", async () => {
    await setup();

    expect(screen.getByText("Pick an action to add")).toBeInTheDocument();
    expect(screen.getByText("Tables")).toBeInTheDocument();
    expect(screen.getByText("Models")).toBeInTheDocument();

    expect(screen.getByText("SampleDB")).toBeInTheDocument();
  });

  it("should not render models tab if models are not enabled", async () => {
    await setup({
      hasModels: false,
    });

    expect(screen.getByText("Pick an action to add")).toBeInTheDocument();
    expect(screen.queryByText("Tables")).not.toBeInTheDocument();
    expect(screen.queryByText("Models")).not.toBeInTheDocument();

    expect(screen.getByText("SampleDB")).toBeInTheDocument();
  });
});

async function setup(
  options: Partial<React.ComponentProps<typeof TableOrModelActionPicker>> & {
    hasModels?: boolean;
  } = {},
) {
  const { hasModels = true, ...props } = options;
  const onChangeSpy = jest.fn();
  const onCloseSpy = jest.fn();

  setupSearchEndpoints(hasModels ? [mockSearchItem] : []);
  setupRecentViewsAndSelectionsEndpoints([]);

  fetchMock.get("path:/api/action/v2/database", {
    databases: [mockDb, mockDb2],
  });
  fetchMock.get(`path:/api/action/v2/database/${mockDb.id}/table`, {
    tables: [mockTable, mockTable2, mockTable3],
  });
  fetchMock.get(`path:/api/action/v2/database/${mockDb2.id}/table`, {
    tables: [mockTable4],
  });
  fetchMock.get("path:/api/action/v2/", { actions: [] });

  const { debug } = renderWithProviders(
    <Modal.Root opened onClose={onCloseSpy}>
      <TableOrModelActionPicker
        value={undefined}
        initialDbId={undefined}
        onChange={onChangeSpy}
        onClose={onCloseSpy}
        {...props}
      />
    </Modal.Root>,
  );

  await waitForLoaderToBeRemoved();

  return {
    debug,
    onChangeSpy,
    onCloseSpy,
  };
}
