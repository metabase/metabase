import React from "react";
import { render, screen } from "@testing-library/react";
import { backspace, setInputValue } from "metabase/parameters/mock";
import userEvent from "@testing-library/user-event";
import NumberInputWidget from "./NumberInputWidget";

const user = userEvent.setup();

const mockSetValue = jest.fn();

describe("NumberInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      render(<NumberInputWidget value={[123]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveValue("123");
    });

    it("should render an empty input", () => {
      render(<NumberInputWidget value={undefined} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveAttribute("placeholder", "Enter a number");
    });

    it("should render a disabled update button, until the value is changed", async () => {
      render(<NumberInputWidget value={[123]} setValue={mockSetValue} />);

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toHaveAttribute("disabled");

      await user.type(screen.getByRole("textbox"), "456");
      expect(button).not.toHaveAttribute("disabled");
    });

    it("should let you update the input with a new value", async () => {
      render(<NumberInputWidget value={[123]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      await user.clear(textbox);
      await user.type(textbox, "456");
      const button = screen.getByRole("button", { name: "Update filter" });
      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith([456]);
    });

    it("should let you update the input with an undefined value", async () => {
      render(<NumberInputWidget value={[1]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      const button = screen.getByRole("button", { name: "Update filter" });
      await user.type(textbox, "{backspace}");
      await user.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });

  describe("arity of 2", () => {
    it("should render an input populated with a value", () => {
      render(
        <NumberInputWidget
          arity={2}
          value={[123, 456]}
          setValue={mockSetValue}
        />,
      );

      const [textbox1, textbox2] = screen.getAllByRole("textbox");
      expect(textbox1).toBeInTheDocument();
      expect(textbox1).toHaveValue("123");

      expect(textbox2).toBeInTheDocument();
      expect(textbox2).toHaveValue("456");
    });

    it("should be invalid when one of the inputs is empty", async () => {
      render(
        <NumberInputWidget
          arity={2}
          value={[123, 456]}
          setValue={mockSetValue}
        />,
      );

      const [textbox1] = screen.getAllByRole("textbox");
      await user.clear(textbox1);
      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toHaveAttribute("disabled");
    });

    it("should be settable", async () => {
      render(
        <NumberInputWidget
          arity={2}
          value={undefined}
          setValue={mockSetValue}
        />,
      );

      const [textbox1, textbox2] = screen.getAllByRole("textbox");
      await user.type(textbox1, "1");
      await user.type(textbox2, "2");

      const button = screen.getByRole("button", { name: "Add filter" });
      await user.click(button);

      expect(mockSetValue).toHaveBeenCalledWith([1, 2]);
    });

    it("should be clearable by emptying all inputs", async () => {
      render(
        <NumberInputWidget
          arity={2}
          value={[123, 456]}
          setValue={mockSetValue}
        />,
      );

      const [textbox1, textbox2] = screen.getAllByRole("textbox");
      await user.clear(textbox1);
      await user.clear(textbox2);

      const button = screen.getByRole("button", { name: "Update filter" });
      await user.click(button);

      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });

  describe("arity of n", () => {
    it("should render a token field input", () => {
      render(
        <NumberInputWidget
          arity="n"
          value={[1, 2, 3, 4]}
          setValue={mockSetValue}
        />,
      );

      const values = screen.getAllByRole("list")[0];
      expect(values.textContent).toEqual("1234");
    });

    it("should correctly parse number inputs", async () => {
      render(
        <NumberInputWidget
          arity="n"
          value={undefined}
          setValue={mockSetValue}
        />,
      );
      const input = screen.getByRole("textbox") as HTMLInputElement;

      const inputValues = ["foo", "123abc", "456"];

      for (const inputValue of inputValues) {
        await setInputValue(input, inputValue);
      }

      const values = screen.getAllByRole("list")[0];
      expect(values.textContent).toEqual("123456");

      await user.click(screen.getByRole("button", { name: "Add filter" }));
      expect(mockSetValue).toHaveBeenCalledWith([123, 456]);
    });

    it("should be unsettable", async () => {
      render(
        <NumberInputWidget arity="n" value={[1, 2]} setValue={mockSetValue} />,
      );

      const input = screen.getByRole("textbox") as HTMLInputElement;

      backspace(input);
      backspace(input);

      await user.click(screen.getByText("Update filter"));
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });
});
