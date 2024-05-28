import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { TextWidget } from "./TextWidget";

const TextInputWithStateWrapper = ({ value }: { value?: number | string }) => {
  const [val, setVal] = useState<number | string | null>(value ?? "");
  return (
    <TextWidget value={val ?? ""} setValue={setVal} focusChanged={jest.fn()} />
  );
};

describe("TextWidget", () => {
  it("should render correctly", () => {
    render(
      <TextWidget
        value={"Hello, world!"}
        setValue={jest.fn()}
        focusChanged={jest.fn()}
      ></TextWidget>,
    );
    expect(screen.getByRole("textbox")).toHaveValue("Hello, world!");
  });

  it("should accept editing", () => {
    render(
      <TextWidget
        value={""}
        setValue={jest.fn()}
        focusChanged={jest.fn()}
      ></TextWidget>,
    );

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Toucan McBird" },
    });
    expect(screen.getByRole("textbox")).toHaveValue("Toucan McBird");
  });

  it("should render a zero as an initial value", () => {
    render(
      <TextWidget value={0} setValue={jest.fn()} focusChanged={jest.fn()} />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("0");
  });

  it("should accept zero as an input value", async () => {
    render(<TextInputWithStateWrapper />);

    const textbox = screen.getByRole("textbox");

    await userEvent.type(textbox, "0");
    expect(textbox).toHaveValue("0");
  });

  it("should keep zero value when pressing enter", async () => {
    render(<TextInputWithStateWrapper />);

    const textbox = screen.getByRole("textbox");

    await userEvent.type(textbox, "0{enter}");
    expect(textbox).toHaveValue("0");
  });
});
