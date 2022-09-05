import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ORDERS } from "__support__/sample_database_fixture";

import DataSelectorFieldPicker from "./DataSelectorFieldPicker";

describe("DataSelectorFieldPicker", () => {
  describe("when loading", () => {
    it("uses 'Fields' as title if selectedTable not passed", () => {
      render(<DataSelectorFieldPicker isLoading={true} />);

      expect(screen.getByText("Fields")).toBeInTheDocument();
    });

    it("uses table display name as title if passed", () => {
      const displayName = "Display name";

      render(
        <DataSelectorFieldPicker
          isLoading={true}
          selectedTable={{ display_name: displayName }}
        />,
      );

      expect(screen.getByText(displayName)).toBeInTheDocument();
    });

    it("goes back if clicked", () => {
      const onBack = jest.fn();

      render(<DataSelectorFieldPicker isLoading={true} onBack={onBack} />);

      fireEvent.click(screen.getByText("Fields"));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("loaded", () => {
    it("displays table name and fields", () => {
      const tableDisplayName = "Table display name";

      const selectedTable = {
        display_name: tableDisplayName,
      };

      const fields = [ORDERS.PRODUCT_ID];

      render(
        <DataSelectorFieldPicker
          selectedTable={selectedTable}
          fields={fields}
        />,
      );

      expect(screen.getByText(tableDisplayName)).toBeInTheDocument();
      expect(screen.getByText("Product ID")).toBeInTheDocument();
    });
  });
});
