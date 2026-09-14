import { createMockState } from "__support__/state";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { getMetadata } from "metabase/metadata-store";
import * as Urls from "metabase/urls";
import { checkNotNull } from "metabase/utils/types";
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

  return { state };
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

  it("should link each table to a new question on it", () => {
    const { state } = setup({ tables: [createProductsTable()] });
    const newQuestion = checkNotNull(
      getMetadata(state).table(PRODUCTS_ID),
    ).newQuestion();

    expect(screen.getByRole("link", { name: /Products/ })).toHaveAttribute(
      "href",
      Urls.question(newQuestion),
    );
  });
});
