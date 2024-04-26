import userEvent from "@testing-library/user-event";

import {
  setupDatabasesEndpoints,
  setupFieldsValuesEndpoints,
} from "__support__/server-mocks";
import { createMockEntitiesState } from "__support__/store";
import { renderWithProviders, screen } from "__support__/ui";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import type Field from "metabase-lib/metadata/Field";
import {
  createSampleDatabase,
  PRODUCTS,
  PRODUCT_CATEGORY_VALUES,
  PRODUCT_VENDOR_VALUES,
} from "metabase-types/api/mocks/presets";
import { createMockState } from "metabase-types/store/mocks";

import CategoryFieldPicker from "./CategoryFieldPicker";

const db = createSampleDatabase();
const storeInitialState = createMockState({
  entities: createMockEntitiesState({
    databases: [db],
  }),
});
const metadata = getMetadata(storeInitialState);

const productCategoryField = checkNotNull(metadata.field(PRODUCTS.CATEGORY));
const productVendorField = checkNotNull(metadata.field(PRODUCTS.VENDOR));

const productCategories = PRODUCT_CATEGORY_VALUES.values.flat() as string[];

function setup({ value = "", field }: { value?: string; field: Field }) {
  const onChange = jest.fn();
  const db = createSampleDatabase();

  setupDatabasesEndpoints([db]);
  setupFieldsValuesEndpoints([PRODUCT_CATEGORY_VALUES, PRODUCT_VENDOR_VALUES]);

  renderWithProviders(
    <CategoryFieldPicker value={value} field={field} onChange={onChange} />,
    {
      storeInitialState,
    },
  );

  return { onChange };
}

describe("CategoryFieldPicker", () => {
  describe("given a few distinct values", () => {
    it("should render a radio picker", () => {
      setup({ field: productCategoryField });
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("should list the distinct values", async () => {
      setup({ field: productCategoryField });

      for (const categoryName of productCategories) {
        expect(await screen.findByText(categoryName)).toBeInTheDocument();
      }
    });

    it("should highlight provided value", async () => {
      const [value, anotherValue] = productCategories;
      setup({ value, field: productCategoryField });

      expect(await screen.findByLabelText(value)).toBeChecked();
      expect(screen.getByLabelText(anotherValue)).not.toBeChecked();
    });

    it("should trigger onChange when clicking a value", async () => {
      const [value] = productCategories;
      const { onChange } = setup({ field: productCategoryField });

      await userEvent.click(await screen.findByText(value));

      expect(onChange).toHaveBeenCalledWith(value);
    });
  });

  describe("given many distinct values", () => {
    it("should render a field input", () => {
      setup({ field: productVendorField });
      expect(screen.getByRole("textbox")).toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });

    it("should fill in provided value", () => {
      const value = "Ergonomic Chairs Inc.";
      setup({ value, field: productVendorField });
      expect(screen.getByRole("textbox")).toHaveValue(value);
    });

    it("should trigger onChange when typing", async () => {
      const value = "Ergonomic Chairs Inc.";
      const { onChange } = setup({ field: productVendorField });

      await userEvent.type(screen.getByRole("textbox"), value);

      expect(onChange).toHaveBeenCalledWith(value);
    });
  });
});
