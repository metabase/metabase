import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockDatabase,
  createMockTableRemapping,
} from "metabase-types/api/mocks";

import { TableRemappingSection } from "./TableRemappingSection";

const POSTGRES = createMockDatabase({ id: 10, name: "Postgres" });

describe("TableRemappingSection", () => {
  it("renders the database name and a remapping row", () => {
    renderWithProviders(
      <TableRemappingSection
        database={POSTGRES}
        remappings={[
          createMockTableRemapping({
            database_id: POSTGRES.id,
            from_schema: "public",
            from_table_name: "orders",
            to_schema: "ws_dev",
            to_table_name: "orders",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Postgres")).toBeInTheDocument();
    expect(screen.getByText("public/orders")).toBeInTheDocument();
    expect(screen.getByText("ws_dev/orders")).toBeInTheDocument();
  });
});
