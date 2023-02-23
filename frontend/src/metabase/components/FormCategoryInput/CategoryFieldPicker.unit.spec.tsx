import React from "react";
import fetchMock from "fetch-mock";
import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import { PRODUCTS } from "__support__/sample_database_fixture";

import Field from "metabase-lib/metadata/Field";

import CategoryFieldPicker from "./CategoryFieldPicker";

function setup({ value = "", field }: { value?: string; field: Field }) {
  const onChange = jest.fn();
  renderWithProviders(
    <CategoryFieldPicker value={value} field={field} onChange={onChange} />,
    {
      withSampleDatabase: true,
    },
  );
  return { onChange };
}

const productCategoryField = new Field({
  ...PRODUCTS.CATEGORY.getPlainObject(),
  fingerprint: {
    global: {
      "distinct-count": 4,
    },
  },
});

const productVendorField = new Field({
  ...PRODUCTS.VENDOR.getPlainObject(),
  fingerprint: {
    global: {
      "distinct-count": 80,
    },
  },
});

describe("CategoryFieldPicker", () => {
  describe("given a few distinct values", () => {
    beforeEach(() => {
      fetchMock.get(
        `/api/field/${productCategoryField.id}/values`,
        productCategoryField.fieldValues(),
      );
    });

    it("should render a radio picker", () => {
      setup({ field: productCategoryField });
      expect(screen.getByRole("radiogroup")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("should list the distinct values", () => {
      setup({ field: productCategoryField });

      productCategoryField
        .fieldValues()
        .flat()
        .forEach((value: string) => {
          expect(screen.getByText(value)).toBeInTheDocument();
        });
    });

    it("should highlight provided value", () => {
      const [value, anotherValue] = productCategoryField.fieldValues().flat();
      setup({ value, field: productCategoryField });

      expect(screen.getByLabelText(value)).toBeChecked();
      expect(screen.getByLabelText(anotherValue)).not.toBeChecked();
    });

    it("should trigger onChange when clicking a value", () => {
      const [value] = productCategoryField.fieldValues().flat();
      const { onChange } = setup({ field: productCategoryField });

      screen.getByText(value).click();

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

    it("should trigger onChange when typing", () => {
      const value = "Ergonomic Chairs Inc.";
      const { onChange } = setup({ field: productVendorField });

      userEvent.type(screen.getByRole("textbox"), value);

      expect(onChange).toHaveBeenCalledWith(value);
    });
  });
});
