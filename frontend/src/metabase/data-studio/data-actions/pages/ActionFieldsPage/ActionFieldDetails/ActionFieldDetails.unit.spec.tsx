import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import type { FieldSettings } from "metabase-types/api";
import {
  createMockActionParameter,
  createMockFieldSettings,
} from "metabase-types/api/mocks";

import { ActionFieldDetails } from "./ActionFieldDetails";

type SetupOpts = {
  settings?: Partial<FieldSettings>;
  canChangeFieldType?: boolean;
};

function setup({ settings, canChangeFieldType = true }: SetupOpts = {}) {
  const onChange = jest.fn();

  renderWithProviders(
    <ActionFieldDetails
      field={{
        parameter: createMockActionParameter({ id: "status" }),
        settings: createMockFieldSettings({
          id: "status",
          title: "Status",
          ...settings,
        }),
        variableName: "status",
      }}
      readOnly={false}
      canChangeFieldType={canChangeFieldType}
      onChange={onChange}
    />,
  );

  return { onChange };
}

describe("ActionFieldDetails", () => {
  it("should save dropdown options without duplicates", async () => {
    const { onChange } = setup({ settings: { inputType: "select" } });

    await userEvent.type(screen.getByLabelText("Options"), "a{enter}b{enter}a");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith({ valueOptions: ["a", "b"] });
  });

  it("should save the default value of a number field as a number", async () => {
    const { onChange } = setup({
      settings: { fieldType: "number", inputType: "number" },
    });

    await userEvent.type(screen.getByLabelText("Default value"), "42");
    await userEvent.tab();

    expect(onChange).toHaveBeenCalledWith({ defaultValue: 42 });
  });

  it("should keep the dropdown and its options when switching from text to number", async () => {
    const { onChange } = setup({
      settings: { inputType: "select", valueOptions: ["1", "2", "shipped"] },
    });

    await userEvent.click(screen.getByText("Number"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldType: "number",
        inputType: "select",
        valueOptions: [1, 2],
      }),
    );
  });

  it("should warn about a hidden required field without a default value", () => {
    setup({ settings: { hidden: true, required: true } });

    expect(
      screen.getByText(/hidden required field with no default value/),
    ).toBeInTheDocument();
  });

  it("should warn about a hidden required field with a null default value", () => {
    setup({ settings: { hidden: true, required: true, defaultValue: null } });

    expect(
      screen.getByText(/hidden required field with no default value/),
    ).toBeInTheDocument();
  });

  it("should not warn about a hidden required field with a default value", () => {
    setup({ settings: { hidden: true, required: true, defaultValue: "new" } });

    expect(
      screen.queryByText(/hidden required field with no default value/),
    ).not.toBeInTheDocument();
  });

  it("should not allow changing the field type without native query permissions", () => {
    setup({ canChangeFieldType: false });

    expect(screen.getByRole("radio", { name: "Number" })).toBeDisabled();
  });
});
