import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { createMockTable } from "metabase-types/api/mocks";
import {
  PRODUCTS_ID,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { type ConnectedTable, ConnectedTables } from "./ConnectedTables";

function setup({ tables }: { tables: ConnectedTable[] }) {
  const state = createMockState({
    entities: createMockEntitiesState({
      databases: [createSampleDatabase()],
    }),
  });

  renderWithProviders(
    <div data-testid="test-container">
      <ConnectedTables tables={tables} />
    </div>,
    { storeInitialState: state },
  );
}

describe("ConnectedTables", () => {
  it("should show nothing when there are no connected tables", () => {
    setup({ tables: [] });
    const container = screen.getByTestId("test-container");
    expect(container).toBeEmptyDOMElement();
  });

  it("should show a label for each connected table", () => {
    setup({
      tables: [
        createMockTable({ id: 2, display_name: "Foo" }),
        createMockTable({ id: 3, display_name: "Bar" }),
      ],
    });

    expect(screen.getByText("Foo")).toBeInTheDocument();
    expect(screen.getByText("Bar")).toBeInTheDocument();
  });

  it("should limit the number of connected tables to 8", () => {
    setup({
      tables: Array.from({ length: 20 }).map((_, idx) =>
        createMockTable({ id: 21 + idx, display_name: `Bar-${idx + 1}` }),
      ),
    });

    expect(screen.getAllByText(/Bar-\d/)).toHaveLength(8);
  });

  it("should link a table to the page that queries its rows", () => {
    setup({ tables: [createProductsTable()] });

    expect(screen.getByRole("link", { name: /Products/ })).toHaveAttribute(
      "href",
      `/table/${PRODUCTS_ID}-products`,
    );
  });

  it("should link a table the /table route cannot address to an ad-hoc question", () => {
    setup({
      tables: [
        createMockTable({ id: "card__1", db_id: 1, display_name: "A model" }),
      ],
    });

    expect(screen.getByRole("link", { name: /A model/ })).toHaveAttribute(
      "href",
      "/question#?db=1&table=card__1",
    );
  });
});
