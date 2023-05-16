import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ORDERS } from "__support__/sample_database_fixture";

import Table from "metabase-lib/metadata/Table";

import DataSelectorFieldPicker from "./DataSelectorFieldPicker";

const props = {
  hasFiltering: true,
  hasInitialFocus: false,
  fields: [],
  onBack: jest.fn(),
  onChangeField: jest.fn(),
};

describe("DataSelectorFieldPicker", () => {
  describe("when loading", () => {
    it("uses 'Fields' as title if selectedTable not passed", () => {
      render(<DataSelectorFieldPicker {...props} isLoading={true} />);

      expect(screen.getByText("Fields")).toBeInTheDocument();
    });

    it("uses table display name as title if passed", () => {
      const displayName = "Display name";

      render(
        <DataSelectorFieldPicker
          {...props}
          isLoading={true}
          selectedTable={{ display_name: displayName } as Table}
        />,
      );

      expect(screen.getByText(displayName)).toBeInTheDocument();
    });

    it("goes back if clicked", () => {
      const onBack = jest.fn();

      render(
        <DataSelectorFieldPicker {...props} isLoading={true} onBack={onBack} />,
      );

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

      render(
        <DataSelectorFieldPicker
          {...props}
          selectedTable={selectedTable as Table}
          fields={[ORDERS.PRODUCT_ID]}
        />,
      );

      expect(screen.getByText(tableDisplayName)).toBeInTheDocument();
      expect(screen.getByText("Product ID")).toBeInTheDocument();
    });
  });
});
