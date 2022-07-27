import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { backspace, setInputValue } from "metabase/parameters/mock";

import StringInputWidget from "./StringInputWidget";

const mockSetValue = jest.fn();

const user = userEvent.setup();

describe("StringInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      const values = screen.getAllByRole("list")[0];
      expect(values.textContent).toEqual("foo");
    });

    it("should render an empty input", () => {
      render(<StringInputWidget value={undefined} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveAttribute("placeholder", "Enter some text");
    });

    it("should render a disabled update button, until the value is changed", async () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("disabled");

      await user.type(screen.getByRole("textbox"), "bar");
      expect(button).not.toHaveAttribute("disabled");
    });

    it("should let you update the input with a new value", async () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      await user.type(textbox, "{Backspace}{Backspace}{Backspace}bar");
      const button = screen.getByRole("button", { name: "Update filter" });
      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should let you update the input with an undefined value", async () => {
      render(<StringInputWidget value={["a"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox") as HTMLInputElement;
      const button = screen.getByRole("button", { name: "Update filter" });
      await setInputValue(textbox);
      backspace(textbox);
      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });

  describe("arity of n", () => {
    it("should render a token field input", () => {
      render(
        <StringInputWidget
          arity="n"
          value={["foo", "bar"]}
          setValue={mockSetValue}
        />,
      );

      const values = screen.getAllByRole("list")[0];
      expect(values.textContent).toEqual("foobar");
    });

    it("should correctly parse number inputs", async () => {
      render(
        <StringInputWidget
          arity="n"
          value={undefined}
          setValue={mockSetValue}
        />,
      );

      const input = screen.getByRole("textbox") as HTMLInputElement;

      const inputValues = ["foo", "bar", "baz"];

      for (const inputValue of inputValues) {
        await setInputValue(input, inputValue);
      }

      const values = screen.getAllByRole("list")[0];
      expect(values.textContent).toEqual("foobarbaz");

      const button = screen.getByRole("button", { name: "Add filter" });
      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["foo", "bar", "baz"]);
    });

    it("should be unsettable", async () => {
      render(
        <StringInputWidget
          arity="n"
          value={["foo", "bar"]}
          setValue={mockSetValue}
        />,
      );

      const input = screen.getByRole("textbox") as HTMLInputElement;
      backspace(input);
      backspace(input);

      const button = screen.getByRole("button", { name: "Update filter" });

      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });
});
