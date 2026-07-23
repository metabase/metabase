import type { ReactElement } from "react";

import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import {
  ORDERS,
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { DataSelectorFieldPicker } from "./DataSelectorFieldPicker";

const state = createMockState({
  entities: createMockEntitiesState({
    databases: [createSampleDatabase()],
  }),
});

const metadata = getMetadata(state);

const props = {
  hasFiltering: true,
  hasInitialFocus: false,
  fields: [],
  onBack: jest.fn(),
  onChangeField: jest.fn(),
};

const render = (ui: ReactElement) =>
  renderWithProviders(ui, { storeInitialState: state });

describe("DataSelectorFieldPicker", () => {
  describe("when loading", () => {
    it("uses 'Fields' as title if selectedTable not passed", () => {
      render(<DataSelectorFieldPicker {...props} isLoading={true} />);

      expect(screen.getByText("Fields")).toBeInTheDocument();
    });

    it("uses table display name as title if passed", () => {
      const selectedTable = checkNotNull(metadata.table(ORDERS_ID));

      render(
        <DataSelectorFieldPicker
          {...props}
          isLoading={true}
          selectedTable={selectedTable}
        />,
      );

      expect(
        screen.getByText(checkNotNull(selectedTable.display_name)),
      ).toBeInTheDocument();
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
      const selectedTable = checkNotNull(metadata.table(ORDERS_ID));

      render(
        <DataSelectorFieldPicker
          {...props}
          selectedTable={selectedTable}
          fields={[checkNotNull(metadata.field(ORDERS.PRODUCT_ID))]}
        />,
      );

      expect(
        screen.getByText(checkNotNull(selectedTable.display_name)),
      ).toBeInTheDocument();
      expect(screen.getByText("Product ID")).toBeInTheDocument();
      expect(screen.getByLabelText("More info")).toBeInTheDocument();
    });

    it("keeps the search box visible and shows an empty state when no field matches the search (metabase#74670)", () => {
      render(
        <DataSelectorFieldPicker
          {...props}
          selectedTable={checkNotNull(metadata.table(ORDERS_ID))}
          fields={[
            checkNotNull(metadata.field(ORDERS.ID)),
            checkNotNull(metadata.field(ORDERS.TOTAL)),
          ]}
        />,
      );

      fireEvent.change(screen.getByPlaceholderText("Find..."), {
        target: { value: "xyznonexistent" },
      });

      // the search box must stay visible so the user can correct the query
      expect(screen.getByPlaceholderText("Find...")).toBeInTheDocument();
      // and an empty state should explain why no fields are shown
      expect(screen.getByText("Didn't find any results")).toBeInTheDocument();
      expect(screen.queryByText("ID")).not.toBeInTheDocument();
      expect(screen.queryByText("Total")).not.toBeInTheDocument();
    });
  });
});
