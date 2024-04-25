import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockParameter } from "metabase-types/api/mocks";

import { StringInputWidget } from "./StringInputWidget";

const mockSetValue = jest.fn();
const mockParameter = createMockParameter();

describe("StringInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      render(
        <StringInputWidget
          value={["foo"]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(screen.getByDisplayValue("foo")).toBeInTheDocument();
    });

    it("should render an empty input", () => {
      render(
        <StringInputWidget
          value={undefined}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveAttribute("placeholder", "Enter some text");
    });

    it("should render a disabled update button, until the value is changed", async () => {
      render(
        <StringInputWidget
          value={["foo"]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "bar");
      expect(button).toBeEnabled();
    });

    it("should let you update the input with a new value", async () => {
      render(
        <StringInputWidget
          value={["foo"]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");

      await userEvent.type(textbox, "bar");

      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["foobar"]);
    });

    it("should let you update the input with an undefined value", async () => {
      render(
        <StringInputWidget
          value={["a"]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.type(textbox, "{backspace}{enter}");
      await userEvent.click(button);
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
          parameter={mockParameter}
        />,
      );

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("foobar");
    });

    it("should correctly parse number inputs", async () => {
      render(
        <StringInputWidget
          arity="n"
          value={undefined}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "foo{enter}bar{enter}baz{enter}");

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("foobarbaz");

      const button = screen.getByRole("button", { name: "Add filter" });
      await userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(["foo", "bar", "baz"]);
    });

    it("should be unsettable", async () => {
      render(
        <StringInputWidget
          arity="n"
          value={["foo", "bar"]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "{backspace}{backspace}");

      const button = screen.getByRole("button", { name: "Update filter" });

      await userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith(undefined);
    });
  });
});
