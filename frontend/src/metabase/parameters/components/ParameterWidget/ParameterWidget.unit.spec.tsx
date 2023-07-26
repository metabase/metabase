import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";
import type { FieldFilterUiParameter } from "metabase-lib/parameters/types";
import Field from "metabase-lib/metadata/Field";

import { ParameterWidget } from "./ParameterWidget";

interface SetupOpts {
  connectedField?: Field;
}

function setup({ connectedField }: SetupOpts = {}) {
  const parameter: FieldFilterUiParameter = {
    ...createMockParameter({
      id: "1fe8ce3",
      type: "string/contains",
      slug: "text_contains",
      name: "Text contains",
    }),
    fields: connectedField ? [connectedField] : [],
  };

  const setValue = jest.fn();

  renderWithProviders(
    <ParameterWidget parameter={parameter} setValue={setValue} />,
  );

  return { setValue };
}

describe("ParameterWidget", () => {
  it("should render parameter", () => {
    setup();
    expect(screen.getByText("Text contains")).toBeInTheDocument();
  });

  it("should be able to set parameter value", () => {
    const { setValue } = setup();

    userEvent.click(screen.getByText("Text contains"));
    userEvent.type(screen.getByPlaceholderText("Enter some text"), "Gadget");

    userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(setValue).toHaveBeenCalledWith(["Gadget"]);
  });

  it("should not be able to submit empty value (metabase#15462)", () => {
    const { setValue } = setup();

    userEvent.click(screen.getByText("Text contains"));

    const text = "Gadget";
    const textInput = screen.getByPlaceholderText("Enter some text");
    userEvent.type(textInput, text);
    expect(screen.getByRole("button", { name: "Add filter" })).toBeEnabled();

    userEvent.type(textInput, "{backspace}".repeat(text.length));
    expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();

    userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(setValue).not.toHaveBeenCalled();
  });

  it("should not be able to submit empty value when parameter has connected field (metabase#15462)", () => {
    const field = new Field(
      createMockField({
        id: 1,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
    );
    const { setValue } = setup({ connectedField: field });

    userEvent.click(screen.getByText("Text contains"));

    const text = "Gadget";
    const textInput = screen.getByPlaceholderText("Enter some text");
    userEvent.type(textInput, text);
    expect(screen.getByRole("button", { name: "Add filter" })).toBeEnabled();

    userEvent.type(textInput, "{backspace}".repeat(text.length));
    expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();

    userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(setValue).not.toHaveBeenCalled();
  });
});
