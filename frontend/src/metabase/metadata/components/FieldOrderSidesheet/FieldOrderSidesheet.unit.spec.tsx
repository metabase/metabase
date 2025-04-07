import fetchMock from "fetch-mock";

import { setupTableQueryMetadataEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { TableId } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { PRODUCTS_ID } from "metabase-types/api/mocks/presets";

import { FieldOrderSidesheet } from "./FieldOrderSidesheet";

interface SetupOpts {
  error?: boolean;
  isOpen: boolean;
  tableId?: TableId;
}

const setup = ({ error, isOpen, tableId = PRODUCTS_ID }: SetupOpts) => {
  const table = createMockTable({ id: tableId });

  if (error) {
    fetchMock.get(`path:/api/table/${table.id}/query_metadata`, 500);
  } else {
    setupTableQueryMetadataEndpoint(table);
  }

  renderWithProviders(
    <FieldOrderSidesheet
      isOpen={isOpen}
      tableId={tableId}
      onClose={jest.fn()}
    />,
  );
};

describe("FieldOrderSidesheet", () => {
  it("shows loading state when sidesheet is open", async () => {
    setup({ isOpen: true });

    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
  });

  it("does not show loading state when sidesheet is closed", async () => {
    setup({ isOpen: false });

    expect(screen.queryByTestId("loading-indicator")).not.toBeInTheDocument();
  });

  it("shows error state when sidesheet is open", async () => {
    setup({ error: true, isOpen: true });

    await waitForLoaderToBeRemoved();

    expect(screen.getByText("An error occurred")).toBeInTheDocument();
  });

  it("does not show error state when sidesheet is closed", async () => {
    setup({ error: true, isOpen: false });

    await waitForLoaderToBeRemoved();

    expect(screen.queryByText("An error occurred")).not.toBeInTheDocument();
  });
});
