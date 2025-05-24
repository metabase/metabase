import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, within } from "__support__/ui";
import type { Field } from "metabase-types/api";
import {
  createOrdersQuantityField,
  createProductsCreatedAtField,
  createProductsVendorField,
} from "metabase-types/api/mocks/presets";

import { CoercionStrategyPicker } from "./CoercionStrategyPicker";

interface TestComponentProps {
  initialValue: string | undefined;
  baseType: string;
}

function TestComponent({ baseType, initialValue }: TestComponentProps) {
  const [value, setValue] = useState(initialValue);

  return (
    <CoercionStrategyPicker
      baseType={baseType}
      value={value}
      onChange={setValue}
    />
  );
}

interface SetupOpts {
  field: Field;
  initialValue?: string;
}

const setup = ({ field, initialValue }: SetupOpts) => {
  renderWithProviders(
    <TestComponent baseType={field.base_type} initialValue={initialValue} />,
  );
};

describe("CoercionStrategyPicker", () => {
  it("shows error on blur when no type is selected", async () => {
    setup({ field: createProductsVendorField() });

    await userEvent.click(screen.getByPlaceholderText("Select data type"));
    await userEvent.tab();

    expect(
      screen.getByText("To enable casting, please select a data type"),
    ).toBeInTheDocument();
  });

  it("does not show error when type is selected", async () => {
    setup({
      field: createProductsVendorField(),
      initialValue: "Coercion/String->Float",
    });

    await userEvent.click(screen.getByPlaceholderText("Select data type"));
    await userEvent.tab();

    expect(
      screen.queryByText("To enable casting, please select a data type"),
    ).not.toBeInTheDocument();
  });

  it("updates value when a new type is selected", async () => {
    setup({ field: createProductsVendorField() });

    await userEvent.click(screen.getByPlaceholderText("Select data type"));

    const dropdown = within(screen.getByRole("listbox"));

    await userEvent.click(dropdown.getByText("Coercion/String->Float"));

    expect(screen.getByPlaceholderText("Select data type")).toHaveValue(
      "Coercion/String->Float",
    );
  });

  it("shows appropriate coercion types for text fields", async () => {
    setup({ field: createProductsVendorField() });

    await assertCoercionTypesVisibility([
      "Coercion/ISO8601->Time",
      "Coercion/ISO8601->Date",
      "Coercion/YYYYMMDDHHMMSSString->Temporal",
      "Coercion/ISO8601->DateTime",
      "Coercion/String->Integer",
      "Coercion/String->Float",
    ]);
  });

  it("shows appropriate coercion types for number fields", async () => {
    setup({ field: createOrdersQuantityField() });

    await assertCoercionTypesVisibility([
      "Coercion/UNIXMicroSeconds->DateTime",
      "Coercion/UNIXMilliSeconds->DateTime",
      "Coercion/UNIXNanoSeconds->DateTime",
      "Coercion/UNIXSeconds->DateTime",
    ]);
  });

  it("shows no coercion types for temporal fields", async () => {
    setup({ field: createProductsCreatedAtField() });

    await assertCoercionTypesVisibility([]);
  });
});

async function assertCoercionTypesVisibility(visibleTypes: string[]) {
  await userEvent.click(screen.getByPlaceholderText("Select data type"));

  const dropdown = within(screen.getByRole("listbox"));

  for (const type of visibleTypes) {
    expect(dropdown.getByRole("option", { name: type })).toBeInTheDocument();
  }

  if (visibleTypes.length === 0) {
    expect(dropdown.queryAllByRole("option")).toHaveLength(visibleTypes.length);
  } else {
    expect(dropdown.getAllByRole("option")).toHaveLength(visibleTypes.length);
  }
}
