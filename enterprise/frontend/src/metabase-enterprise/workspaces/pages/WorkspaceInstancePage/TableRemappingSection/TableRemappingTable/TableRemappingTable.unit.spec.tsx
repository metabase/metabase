import { renderWithProviders, screen } from "__support__/ui";
import { createMockTableRemapping } from "metabase-types/api/mocks";

import { TableRemappingTable } from "./TableRemappingTable";

describe("TableRemappingTable", () => {
  it("renders one row per remapping with joined source and target names", () => {
    renderWithProviders(
      <TableRemappingTable
        remappings={[
          createMockTableRemapping({
            id: 1,
            from_schema: "public",
            from_table_name: "orders",
            to_schema: "ws_dev",
            to_table_name: "orders",
          }),
        ]}
      />,
    );

    expect(screen.getByText("public/orders")).toBeInTheDocument();
    expect(screen.getByText("ws_dev/orders")).toBeInTheDocument();
  });
});
