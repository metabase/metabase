import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import _ from "underscore";
import TextWidget from "./TextWidget";

const TextInputWithStateWrapper = ({ value }: { value?: number | string }) => {
  const [val, setVal] = useState<number | string | null>(value ?? "");
  return (
    <TextWidget value={val ?? ""} setValue={setVal} focusChanged={jest.fn()} />
  );
};

const PLACEHOLDER_TEXT = "Enter a value...";

describe("TextWidget", () => {
  it("should render correctly", () => {
    render(
      <TextWidget
        value="Hello, world!"
        setValue={jest.fn()}
        focusChanged={jest.fn()}
      />,
    );

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    expect(textbox).toHaveValue("Hello, world!");
  });

  it("should accept editing", () => {
    render(
      <TextWidget value={""} setValue={jest.fn()} focusChanged={jest.fn()} />,
    );

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    userEvent.paste(textbox, "Toucan McBird");

    expect(textbox).toHaveValue("Toucan McBird");
  });

  it("should render a zero as an initial value", () => {
    render(
      <TextWidget value={0} setValue={jest.fn()} focusChanged={jest.fn()} />,
    );

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);

    expect(textbox).toHaveValue("0");
  });

  it("should accept zero as an input value", () => {
    render(<TextInputWithStateWrapper />);

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    userEvent.type(textbox, "0");

    expect(textbox).toHaveValue("0");
  });

  it("should keep zero value when pressing enter", () => {
    render(<TextInputWithStateWrapper />);

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    userEvent.type(textbox, "0{enter}");

    expect(textbox).toHaveValue("0");
  });

  it("should trigger setValue with null on blur if value is empty", () => {
    const setValueSpy = jest.fn();

    render(
      <TextWidget value={""} setValue={setValueSpy} focusChanged={jest.fn()} />,
    );

    const textbox = screen.getByPlaceholderText(PLACEHOLDER_TEXT);
    const textToType = "123";

    userEvent.type(textbox, textToType);

    _.times(textToType.length, () => {
      userEvent.type(textbox, "{backspace}");
    });

    expect(textbox).toHaveValue("");

    userEvent.tab();

    expect(setValueSpy).toHaveBeenCalledWith(null);
  });
});
