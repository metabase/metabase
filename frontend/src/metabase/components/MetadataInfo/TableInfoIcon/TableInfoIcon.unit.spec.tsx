import { createMockEntitiesState } from "__support__/store";
import { act, fireEvent, renderWithProviders, screen } from "__support__/ui";
import type { Table } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import { createMockState } from "metabase-types/store/mocks";

import { TableInfoIcon } from "./TableInfoIcon";

type SetupOpts = {
  table: Table;
};

function setup({ table }: SetupOpts) {
  const state = createMockState({
    entities: createMockEntitiesState({
      tables: [table],
    }),
  });

  return renderWithProviders(<TableInfoIcon table={table} />, {
    storeInitialState: state,
  });
}

describe("TableInfoIcon", () => {
  it("should show the hovercard only on hover", async () => {
    jest.useFakeTimers();

    const description = "This a table description";
    const table = createMockTable({ description });
    setup({ table });

    const icon = screen.getByLabelText("More info");

    expect(icon).toBeInTheDocument();
    expect(screen.queryByText(description)).not.toBeInTheDocument();

    fireEvent.mouseEnter(icon);
    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(screen.getByText(description, { exact: false })).toBeInTheDocument();
  });

  it("should not show the icon if there is no description", async () => {
    const table = createMockTable({ description: undefined });
    setup({ table });
    expect(screen.queryByLabelText("More info")).not.toBeInTheDocument();
  });
});
