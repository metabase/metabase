import "mutationobserver-shim";

import { renderWithProviders, screen, waitFor } from "__support__/ui";

import { checkNotNull } from "metabase/core/utils/types";
import { FieldValuesWidget } from "metabase/components/FieldValuesWidget";

import {
  ORDERS,
  PRODUCTS,
  PEOPLE,
  PRODUCT_CATEGORY_VALUES,
  PEOPLE_SOURCE_VALUES,
} from "metabase-types/api/mocks/presets";

import {
  state,
  metadata,
  LISTABLE_PK_FIELD_ID,
  LISTABLE_PK_FIELD_VALUE,
  SEARCHABLE_FK_FIELD_ID,
  EXPRESSION_FIELD_ID,
} from "./testMocks";

async function setup({ fields, values, ...props }) {
  const fetchFieldValues = jest.fn();

  renderWithProviders(
    <FieldValuesWidget
      value={[]}
      fields={fields}
      onChange={jest.fn()}
      fetchFieldValues={fetchFieldValues}
      addRemappings={jest.fn()}
      {...props}
    />,
    {
      storeInitialState: state,
    },
  );

  await waitFor(() => {
    expect(screen.queryByTestId("loading-spinner")).not.toBeInTheDocument();
  });

  return { fetchFieldValues };
}

describe("FieldValuesWidget", () => {
  describe("category field", () => {
    describe("has_field_values = none", () => {
      const field = metadata.field(PEOPLE.PASSWORD);

      it("should not call fetchFieldValues", async () => {
        const { fetchFieldValues } = await setup({
          fields: [field],
        });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Enter some text' as the placeholder text", async () => {
        await setup({ fields: [field] });
        expect(
          screen.getByPlaceholderText("Enter some text"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = list", () => {
      const field = metadata.field(PRODUCTS.CATEGORY);

      it("should call fetchFieldValues", async () => {
        const { fetchFieldValues } = await setup({
          fields: [field],
        });
        expect(fetchFieldValues).toHaveBeenCalledWith(PRODUCTS.CATEGORY);
      });

      it("should not have 'Search the list' as the placeholder text for fields with less or equal than 10 values", async () => {
        await setup({ fields: [field] });
        expect(
          screen.queryByPlaceholderText("Search the list"),
        ).not.toBeInTheDocument();
      });

      it("should have 'Enter some text' as the placeholder text for fields with more than 10 values", async () => {
        const field = metadata.field(PEOPLE.STATE);
        await setup({ fields: [field] });
        expect(
          screen.getByPlaceholderText("Enter some text"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = search", () => {
      const field = metadata.field(PRODUCTS.VENDOR);

      it("should not call fetchFieldValues", async () => {
        const { fetchFieldValues } = await setup({
          fields: [field],
        });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Search by Vendor' as the placeholder text", async () => {
        await setup({ fields: [field] });
        expect(
          screen.getByPlaceholderText("Search by Vendor"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("id field", () => {
    describe("has_field_values = none", () => {
      it("should have 'Enter an ID' as the placeholder text", async () => {
        await setup({
          fields: [metadata.field(ORDERS.PRODUCT_ID)],
        });
        expect(screen.getByPlaceholderText("Enter an ID")).toBeInTheDocument();
      });
    });

    describe("has_field_values = list", () => {
      it("should have 'Search the list' as the placeholder text", async () => {
        await setup({
          fields: [metadata.field(LISTABLE_PK_FIELD_ID)],
        });
        expect(
          screen.getByPlaceholderText("Search the list"),
        ).toBeInTheDocument();
      });
    });

    describe("has_field_values = search", () => {
      it("should have 'Search by Category or enter an ID' as the placeholder text", async () => {
        const field = metadata.field(SEARCHABLE_FK_FIELD_ID).clone();
        const remappedField = metadata.field(PRODUCTS.CATEGORY);
        field.remappedField = () => remappedField;

        await setup({ fields: [field] });

        expect(
          screen.getByPlaceholderText("Search by Category or enter an ID"),
        ).toBeInTheDocument();
      });

      it("should not duplicate 'ID' in placeholder when ID itself is searchable", async () => {
        await setup({
          fields: [metadata.field(SEARCHABLE_FK_FIELD_ID)],
        });
        expect(
          screen.getByPlaceholderText("Search by Product"),
        ).toBeInTheDocument();
      });
    });
  });

  describe("multiple fields", () => {
    it("list multiple fields together", async () => {
      const categoryField = metadata.field(PRODUCTS.CATEGORY).clone();
      categoryField.values = PRODUCT_CATEGORY_VALUES.values;

      const sourceField = metadata.field(PEOPLE.SOURCE).clone();
      sourceField.values = PEOPLE_SOURCE_VALUES.values;

      await setup({ fields: [categoryField, sourceField] });

      expect(
        screen.getByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      expect(screen.getByText("Doohickey")).toBeInTheDocument();
      expect(screen.getByText("Affiliate")).toBeInTheDocument();
    });

    it("search if any field is a search", async () => {
      await setup({
        fields: [
          metadata.field(PRODUCTS.CATEGORY),
          metadata.field(PRODUCTS.VENDOR),
        ],
      });

      expect(screen.getByPlaceholderText("Search")).toBeInTheDocument();
      expect(screen.queryByText("AZ")).not.toBeInTheDocument();
      expect(screen.queryByText("Facebook")).not.toBeInTheDocument();
    });

    it("don't list any values if any is set to 'plain input box'", async () => {
      await setup({
        fields: [metadata.field(PEOPLE.PASSWORD), metadata.field(PEOPLE.STATE)],
      });

      expect(
        screen.getByPlaceholderText("Enter some text"),
      ).toBeInTheDocument();
      expect(screen.queryByText("AZ")).not.toBeInTheDocument();
      expect(screen.queryByText("Facebook")).not.toBeInTheDocument();
    });
  });

  describe("prefix", () => {
    it("should render a passed prefix", async () => {
      await setup({
        fields: [metadata.field(PRODUCTS.PRICE)],
        prefix: "$$$",
      });
      expect(screen.getByTestId("input-prefix")).toHaveTextContent("$$$");
    });

    it("should not render a prefix if omitted", async () => {
      await setup({ fields: [metadata.field(PRODUCTS.PRICE)] });
      expect(screen.queryByTestId("input-prefix")).not.toBeInTheDocument();
    });
  });

  describe("custom expressions", () => {
    const valuesField = checkNotNull(metadata.field(LISTABLE_PK_FIELD_ID));
    const expressionField = checkNotNull(metadata.field(EXPRESSION_FIELD_ID));

    it("should not call fetchFieldValues", async () => {
      const { fetchFieldValues } = await setup({
        fields: [valuesField, expressionField],
      });

      expect(screen.getByText(LISTABLE_PK_FIELD_VALUE)).toBeInTheDocument();
      expect(fetchFieldValues).toHaveBeenCalledWith(LISTABLE_PK_FIELD_ID);
      expect(fetchFieldValues).not.toHaveBeenCalledWith(EXPRESSION_FIELD_ID);
    });
  });
});
