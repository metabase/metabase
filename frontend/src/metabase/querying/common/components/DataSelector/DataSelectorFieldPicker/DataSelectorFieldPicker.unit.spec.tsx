import { createMockEntitiesState } from "__support__/store";
import { fireEvent, renderWithProviders, screen } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { getMetadata } from "metabase/selectors/metadata";
import { checkNotNull } from "metabase/utils/types";
import type Field from "metabase-lib/v1/metadata/Field";
import type Table from "metabase-lib/v1/metadata/Table";
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

interface SetupOpts {
  fields?: Field[];
  isLoading?: boolean;
  selectedTable?: Table;
}

const setup = ({ fields = [], isLoading, selectedTable }: SetupOpts = {}) => {
  const onBack = jest.fn();

  renderWithProviders(
    <DataSelectorFieldPicker
      hasFiltering
      hasInitialFocus={false}
      fields={fields}
      isLoading={isLoading}
      selectedTable={selectedTable}
      onBack={onBack}
      onChangeField={jest.fn()}
    />,
    { storeInitialState: state },
  );

  return { onBack };
};

describe("DataSelectorFieldPicker", () => {
  describe("when loading", () => {
    it("uses 'Fields' as title if selectedTable not passed", () => {
      setup({ isLoading: true });

      expect(screen.getByText("Fields")).toBeInTheDocument();
    });

    it("uses table display name as title if passed", () => {
      const selectedTable = checkNotNull(metadata.table(ORDERS_ID));

      setup({ isLoading: true, selectedTable });

      expect(
        screen.getByText(checkNotNull(selectedTable.display_name)),
      ).toBeInTheDocument();
    });

    it("goes back if clicked", () => {
      const { onBack } = setup({ isLoading: true });

      fireEvent.click(screen.getByText("Fields"));

      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });

  describe("loaded", () => {
    it("displays table name and fields", () => {
      const selectedTable = checkNotNull(metadata.table(ORDERS_ID));

      setup({
        selectedTable,
        fields: [checkNotNull(metadata.field(ORDERS.PRODUCT_ID))],
      });

      expect(
        screen.getByText(checkNotNull(selectedTable.display_name)),
      ).toBeInTheDocument();
      expect(screen.getByText("Product ID")).toBeInTheDocument();
      expect(screen.getByLabelText("More info")).toBeInTheDocument();
    });

    it("keeps the search box visible and shows an empty state when no field matches the search (metabase#74670)", () => {
      setup({
        selectedTable: checkNotNull(metadata.table(ORDERS_ID)),
        fields: [
          checkNotNull(metadata.field(ORDERS.ID)),
          checkNotNull(metadata.field(ORDERS.TOTAL)),
        ],
      });

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
