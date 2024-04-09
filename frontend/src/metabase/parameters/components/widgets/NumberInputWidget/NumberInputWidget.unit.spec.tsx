import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { createMockParameter } from "metabase-types/api/mocks";

import { NumberInputWidget } from "./NumberInputWidget";

const mockSetValue = jest.fn();
const mockParameter = createMockParameter();

describe("NumberInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      render(
        <NumberInputWidget
          value={[123]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveValue("123");
    });

    it("should render an empty input", () => {
      render(
        <NumberInputWidget
          value={undefined}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      expect(textbox).toBeInTheDocument();
      expect(textbox).toHaveAttribute("placeholder", "Enter a number");
    });

    it("should render a disabled update button, until the value is changed", async () => {
      render(
        <NumberInputWidget
          value={[123]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "456");
      expect(button).toBeEnabled();
    });

    it("should let you update the input with a new value", async () => {
      render(
        <NumberInputWidget
          value={[123]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      await userEvent.clear(textbox);
      await userEvent.type(textbox, "456");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith([456]);
    });

    it("should let you update the input with an undefined value", async () => {
      render(
        <NumberInputWidget
          value={[1]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const textbox = screen.getByRole("textbox");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.type(textbox, "{backspace}");
      await userEvent.click(button);
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
          parameter={mockParameter}
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
          parameter={mockParameter}
        />,
      );

      const [textbox1] = screen.getAllByRole("textbox");
      await userEvent.clear(textbox1);
      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeDisabled();
    });

    it("should be settable", async () => {
      render(
        <NumberInputWidget
          arity={2}
          value={undefined}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const [textbox1, textbox2] = screen.getAllByRole("textbox");
      await userEvent.type(textbox1, "1");
      await userEvent.type(textbox2, "2");

      const button = screen.getByRole("button", { name: "Add filter" });
      await userEvent.click(button);

      expect(mockSetValue).toHaveBeenCalledWith([1, 2]);
    });

    it("should be clearable by emptying all inputs", async () => {
      render(
        <NumberInputWidget
          arity={2}
          value={[123, 456]}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const [textbox1, textbox2] = screen.getAllByRole("textbox");
      await userEvent.clear(textbox1);
      await userEvent.clear(textbox2);

      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.click(button);

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
          parameter={mockParameter}
        />,
      );

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("1234");
    });

    it("should correctly parse number inputs", async () => {
      render(
        <NumberInputWidget
          arity="n"
          value={undefined}
          setValue={mockSetValue}
          parameter={mockParameter}
        />,
      );

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "foo{enter}123abc{enter}456{enter}");

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("123456");

      const button = screen.getByRole("button", { name: "Add filter" });
      await userEvent.click(button);
      expect(mockSetValue).toHaveBeenCalledWith([123, 456]);
    });

    it("should be unsettable", async () => {
      render(
        <NumberInputWidget
          arity="n"
          value={[1, 2]}
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
