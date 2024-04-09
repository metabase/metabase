import { screen } from "@testing-library/react";
import userEvent, {
  PointerEventsCheckLevel,
} from "@testing-library/user-event";

import { renderWithProviders } from "__support__/ui";
import Field from "metabase-lib/v1/metadata/Field";
import type { FieldFilterUiParameter } from "metabase-lib/v1/parameters/types";
import { createMockField, createMockParameter } from "metabase-types/api/mocks";

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

  it("should be able to set parameter value", async () => {
    const { setValue } = setup();

    await userEvent.click(screen.getByText("Text contains"));
    await userEvent.type(
      screen.getByPlaceholderText("Enter some text"),
      "Gadget",
    );

    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(setValue).toHaveBeenCalledWith(["Gadget"]);
  });

  it("should not be able to submit empty value (metabase#15462)", async () => {
    const { setValue } = setup();

    await userEvent.click(screen.getByText("Text contains"));

    const text = "Gadget";
    const textInput = screen.getByPlaceholderText("Enter some text");
    await userEvent.type(textInput, text);
    expect(screen.getByRole("button", { name: "Add filter" })).toBeEnabled();

    await userEvent.type(textInput, "{backspace}".repeat(text.length));
    expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Add filter" }), {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    expect(setValue).not.toHaveBeenCalled();
  });

  it("should not be able to submit empty value when parameter has connected field (metabase#15462)", async () => {
    const field = new Field(
      createMockField({
        id: 1,
        base_type: "type/Text",
        effective_type: "type/Text",
        semantic_type: "type/Category",
      }),
    );
    const { setValue } = setup({ connectedField: field });

    await userEvent.click(screen.getByText("Text contains"));

    const text = "Gadget";
    const textInput = screen.getByPlaceholderText("Enter some text");
    await userEvent.type(textInput, text);
    expect(screen.getByRole("button", { name: "Add filter" })).toBeEnabled();

    await userEvent.type(textInput, "{backspace}".repeat(text.length));
    expect(screen.getByRole("button", { name: "Add filter" })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: "Add filter" }), {
      pointerEventsCheck: PointerEventsCheckLevel.Never,
    });
    expect(setValue).not.toHaveBeenCalled();
  });
});
