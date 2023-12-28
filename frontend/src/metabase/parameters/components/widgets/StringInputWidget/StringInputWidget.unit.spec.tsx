import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import StringInputWidget from "./StringInputWidget";

const mockSetValue = jest.fn();

describe("StringInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(screen.getByDisplayValue("foo")).toBeInTheDocument();
    });

    it("should render an empty input", () => {
      render(<StringInputWidget value={undefined} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveAttribute("placeholder", "Enter some text");
    });

    it("should render a disabled update button, until the value is changed", () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();

      userEvent.type(screen.getByRole("textbox"), "bar");
      expect(button).toBeEnabled();
    });

    it("should let you update the input with a new value", () => {
      render(<StringInputWidget value={["foo"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      userEvent.type(textbox, "{backspace}{backspace}{backspace}bar");
      const button = screen.getByRole("button", { name: "Update filter" });
      userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["bar"]);
    });

    it("should let you update the input with an undefined value", () => {
      render(<StringInputWidget value={["a"]} setValue={mockSetValue} />);

      const textbox = screen.getByRole("textbox");
      const button = screen.getByRole("button", { name: "Update filter" });
      userEvent.type(textbox, "{backspace}{enter}");
      userEvent.click(button);
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
      expect(values).toHaveTextContent("foobar");
    });

    it("should correctly parse number inputs", () => {
      render(
        <StringInputWidget
          arity="n"
          value={undefined}
          setValue={mockSetValue}
        />,
      );

      const input = screen.getByRole("textbox");
      userEvent.type(input, "foo{enter}bar{enter}baz{enter}");

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("foobarbaz");

      const button = screen.getByRole("button", { name: "Add filter" });
      userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["foo", "bar", "baz"]);
    });

    it("should be unsettable", () => {
      render(
        <StringInputWidget
          arity="n"
          value={["foo", "bar"]}
          setValue={mockSetValue}
        />,
      );

      const input = screen.getByRole("textbox");
      userEvent.type(input, "{backspace}{backspace}");

      const button = screen.getByRole("button", { name: "Update filter" });

      userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });
});
