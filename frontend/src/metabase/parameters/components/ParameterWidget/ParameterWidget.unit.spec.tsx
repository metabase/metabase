import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMockParameter } from "metabase-types/api/mocks";
import { renderWithProviders } from "__support__/ui";

import { ParameterWidget } from "./ParameterWidget";

function setup() {
  const parameter = createMockParameter({
    id: "1fe8ce3",
    type: "text/contains",
    slug: "text_contains",
    name: "Text contains",
  });

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
});
