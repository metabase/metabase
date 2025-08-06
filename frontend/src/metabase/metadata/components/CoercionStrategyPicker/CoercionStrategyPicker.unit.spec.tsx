import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
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

    await waitFor(() => {
      expect(
        screen.getByText("To enable casting, please select a data type"),
      ).toBeInTheDocument();
    });
  });

  it("does not show error when type is selected", async () => {
    setup({
      field: createProductsVendorField(),
      initialValue: "String → Float",
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

    await userEvent.click(dropdown.getByText("String → Float"));

    expect(screen.getByPlaceholderText("Select data type")).toHaveValue(
      "String → Float",
    );
  });

  it("shows appropriate coercion types for text fields", async () => {
    setup({ field: createProductsVendorField() });

    await assertCoercionTypesVisibility([
      "ISO 8601 → Time",
      "ISO 8601 → Date",
      "YYYYMMDDHHMMSS string → Temporal",
      "ISO 8601 → Datetime",
      "String → Integer",
      "String → Float",
    ]);
  });

  it("shows appropriate coercion types for number fields", async () => {
    setup({ field: createOrdersQuantityField() });

    await assertCoercionTypesVisibility([
      "UNIX microseconds → Datetime",
      "UNIX milliseconds → Datetime",
      "UNIX nanoseconds → Datetime",
      "UNIX seconds → Datetime",
    ]);
  });

  it("shows appropriate coercion types for temporal fields", async () => {
    setup({ field: createProductsCreatedAtField() });

    await assertCoercionTypesVisibility(["DateTime → Date"]);
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
