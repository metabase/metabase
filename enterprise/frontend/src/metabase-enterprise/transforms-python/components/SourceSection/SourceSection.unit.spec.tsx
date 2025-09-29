import { setupTableEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { ConcreteTableId, Table, Transform } from "metabase-types/api";
import { createMockTable } from "metabase-types/api/mocks";
import {
  createMockPythonTransformSource,
  createMockTransform,
} from "metabase-types/api/mocks/transform";

import { SourceSection } from "./SourceSection";

const TABLE_A = createMockTable({
  id: 1,
  name: "table_a",
  display_name: "Table A",
  schema: "schema_a",
});

const TABLE_B = createMockTable({
  id: 2,
  name: "table_b",
  display_name: "Table B",
  schema: "schema_b",
});

type SetupOpts = {
  tables?: Table[];
  transform?: Transform;
};

function setup({
  tables = [TABLE_A, TABLE_B],
  transform = createMockTransform(),
}: SetupOpts = {}) {
  for (const table of tables) {
    setupTableEndpoints(table);
  }
  renderWithProviders(<SourceSection transform={transform} />);
}

describe("SourceSection", () => {
  it("should render nothing for query transform", () => {
    setup({
      transform: createMockTransform({
        source: {
          type: "query",
          query: { type: "query", database: 1, query: { "source-table": 1 } },
        },
      }),
    });
    expect(screen.queryByText("Transform source")).not.toBeInTheDocument();
  });

  it("should render the section with label and description", async () => {
    setup({
      transform: createMockTransform({
        source: createMockPythonTransformSource({
          sourceTables: {
            orders: TABLE_A.id as ConcreteTableId,
            customers: TABLE_B.id as ConcreteTableId,
          },
        }),
      }),
    });

    expect(screen.getByText("Transform source")).toBeInTheDocument();
    expect(
      screen.getByText("The data sources for this Python transform, by alias."),
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryAllByTestId("loader")).toHaveLength(0);
    });

    expect(screen.getByText("orders")).toBeInTheDocument();
    expect(screen.getByText("schema_a")).toBeInTheDocument();
    expect(screen.getByText("Table A")).toBeInTheDocument();

    expect(screen.getByText("customers")).toBeInTheDocument();
    expect(screen.getByText("schema_b")).toBeInTheDocument();
    expect(screen.getByText("Table B")).toBeInTheDocument();
  });
});
