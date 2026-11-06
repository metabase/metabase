import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupTableEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { ConcreteTableId, Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";

import { TablePane } from "./TablePane";

const TABLE_ID: ConcreteTableId = 1;

interface SetupOpts {
  table: Table;
}

const setup = async ({ table }: SetupOpts) => {
  const onBack = jest.fn();
  setupTableEndpoints(table);

  renderWithProviders(
    <TablePane
      type="table"
      id={TABLE_ID}
      onBack={onBack}
      onClose={jest.fn()}
      onItemClick={jest.fn()}
    />,
  );
  await waitForLoaderToBeRemoved();

  return { onBack };
};

describe("TablePane", () => {
  it("should load a table without visible fields only once and stay interactive (metabase#53194)", async () => {
    const table = createMockTable({
      id: TABLE_ID,
      name: "REVIEWS",
      display_name: "Reviews",
      fields: [],
    });
    const { onBack } = await setup({ table });

    expect(await screen.findByText("REVIEWS")).toBeInTheDocument();
    expect(screen.queryByText(/\d+ columns?/)).not.toBeInTheDocument();

    await userEvent.click(screen.getByText("REVIEWS"));
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(
      fetchMock.callHistory.calls(`path:/api/table/${TABLE_ID}/query_metadata`),
    ).toHaveLength(1);
    expect(
      fetchMock.callHistory.calls(`path:/api/table/${TABLE_ID}/fks`),
    ).toHaveLength(1);
  });
});
