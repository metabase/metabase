import userEvent from "@testing-library/user-event";

import { setupFieldSearchValuesEndpoint } from "__support__/server-mocks";
import {
  getBrokenUpTextMatcher,
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import type { IFieldValuesWidgetProps } from "metabase/components/FieldValuesWidget";
import { FieldValuesWidget } from "metabase/components/FieldValuesWidget";
import Fields from "metabase/entities/fields";
import { checkNotNull, isNotNull } from "metabase/lib/types";
import type Field from "metabase-lib/v1/metadata/Field";
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
  metadataWithSearchValuesField,
} from "./testMocks";

async function setup({
  fields,
  prefix,
  searchValue,
  ...props
}: {
  fields: (Field | null | undefined)[];
  searchValue?: string;
  prefix?: string;
} & Omit<Partial<IFieldValuesWidgetProps>, "fields">) {
  const fetchFieldValues = jest.fn(({ id }) => ({
    payload: fields.filter(checkNotNull).find(f => f?.id === id),
    type: "__MOCK__",
  }));

  jest
    .spyOn(Fields.objectActions, "fetchFieldValues")
    .mockImplementation(fetchFieldValues);

  if (searchValue) {
    fields.forEach(field => {
      const fieldId = field?.id as number;
      setupFieldSearchValuesEndpoint(fieldId, fieldId, searchValue);
    });
  }

  renderWithProviders(
    <FieldValuesWidget
      value={[]}
      fields={fields.filter(isNotNull)}
      onChange={jest.fn()}
      prefix={prefix}
      {...props}
    />,
    {
      storeInitialState: state,
    },
  );

  await waitForLoaderToBeRemoved();

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
      const field = checkNotNull(metadata.field(PRODUCTS.CATEGORY));

      it("should call fetchFieldValues", async () => {
        const { fetchFieldValues } = await setup({
          fields: [field],
        });
        expect(fetchFieldValues).toHaveBeenCalledWith(field);
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
      const field = metadata.field(PEOPLE.EMAIL);

      it("should not call fetchFieldValues", async () => {
        const { fetchFieldValues } = await setup({
          fields: [field],
        });
        expect(fetchFieldValues).not.toHaveBeenCalled();
      });

      it("should have 'Search by Vendor' as the placeholder text", async () => {
        await setup({ fields: [field] });
        expect(
          screen.getByPlaceholderText("Search by Email"),
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
        const field = metadata.field(SEARCHABLE_FK_FIELD_ID)?.clone();
        const remappedField = metadata.field(PRODUCTS.CATEGORY);

        if (field) {
          field.remappedField = () => remappedField;
        }

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
      const categoryField = metadata.field(PRODUCTS.CATEGORY)?.clone();
      const sourceField = metadata.field(PEOPLE.SOURCE)?.clone();

      if (categoryField && sourceField) {
        categoryField.values = PRODUCT_CATEGORY_VALUES.values;
        sourceField.values = PEOPLE_SOURCE_VALUES.values;
      }

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
          metadata.field(PEOPLE.EMAIL),
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
    const expressionField = checkNotNull(
      metadata.field(EXPRESSION_FIELD_ID as any),
    );

    it("should not call fetchFieldValues", async () => {
      const { fetchFieldValues } = await setup({
        fields: [valuesField, expressionField],
      });

      expect(screen.getByText(LISTABLE_PK_FIELD_VALUE)).toBeInTheDocument();
      expect(fetchFieldValues).toHaveBeenCalledWith(
        expect.objectContaining({
          id: LISTABLE_PK_FIELD_ID,
          table_id: valuesField.table_id,
        }),
      );
      expect(fetchFieldValues).not.toHaveBeenCalledWith(
        expect.objectContaining({
          id: EXPRESSION_FIELD_ID,
          table_id: expressionField.table_id,
        }),
      );
    });
  });

  describe("NoMatchState", () => {
    it("should display field title when one field passed and there are no matching results", async () => {
      const field = metadataWithSearchValuesField.field(PEOPLE.PASSWORD);
      const displayName = field?.display_name; // "Password"
      const searchValue = "somerandomvalue";

      await setup({
        fields: [field],
        multi: true,
        disablePKRemappingForSearch: true,
        searchValue,
      });

      await userEvent.type(
        screen.getByPlaceholderText(`Search by ${displayName}`),
        searchValue,
      );

      expect(
        await screen.findByText(
          getBrokenUpTextMatcher(`No matching ${displayName} found.`),
        ),
      ).toBeInTheDocument();
    });

    it("should not display field title when multiple fields passed and no matching results found", async () => {
      const searchValue = "somerandomvalue";

      await setup({
        fields: [metadata.field(PEOPLE.CITY), metadata.field(PEOPLE.NAME)],
        multi: true,
        disablePKRemappingForSearch: true,
        searchValue,
      });

      await userEvent.type(screen.getByPlaceholderText("Search"), searchValue);

      expect(await screen.findByText(`No matching result`)).toBeInTheDocument();
    });
  });
});
