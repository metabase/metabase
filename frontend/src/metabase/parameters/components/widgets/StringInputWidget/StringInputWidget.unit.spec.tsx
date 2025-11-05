import userEvent from "@testing-library/user-event";

import { render, screen } from "__support__/ui";
import type { Parameter, ParameterValueOrArray } from "metabase-types/api";
import { createMockParameter } from "metabase-types/api/mocks";

import { StringInputWidget } from "./StringInputWidget";

type SetupOpts = {
  value?: ParameterValueOrArray | undefined;
  parameter?: Parameter;
  isMultiSelect?: boolean;
};

function setup({
  value,
  parameter = createMockParameter(),
  isMultiSelect,
}: SetupOpts = {}) {
  const setValue = jest.fn();
  render(
    <StringInputWidget
      value={value}
      parameter={parameter}
      isMultiSelect={isMultiSelect}
      setValue={setValue}
    />,
  );
  return { setValue };
}

describe("StringInputWidget", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe("arity of 1", () => {
    it("should render an input populated with a value", () => {
      setup({ value: ["foo"] });

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(screen.getByDisplayValue("foo")).toBeInTheDocument();
    });

    it("should render an empty input", () => {
      setup({ value: undefined });

      const input = screen.getByRole("textbox");
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute("placeholder", "Enter some text");
    });

    it("should render a disabled update button, until the value is changed", async () => {
      setup({ value: ["foo"] });

      const button = screen.getByRole("button", { name: "Update filter" });
      expect(button).toBeInTheDocument();
      expect(button).toBeDisabled();

      await userEvent.type(screen.getByRole("textbox"), "bar");
      expect(button).toBeEnabled();
    });

    it("should allow to update the input with a new value", async () => {
      const { setValue } = setup({ value: ["foo"] });

      const input = screen.getByRole("textbox");
      await userEvent.type(input, "bar");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.click(button);
      expect(setValue).toHaveBeenCalledWith(["foobar"]);
    });

    it("should allow to update the input with an undefined value", async () => {
      const { setValue } = setup({ value: ["a"] });

      const input = screen.getByRole("textbox");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.type(input, "{backspace}{enter}");
      await userEvent.click(button);
      expect(setValue).toHaveBeenCalledWith(undefined);
    });

    it("should allow to submit a value on enter", async () => {
      const { setValue } = setup({ value: [] });
      await userEvent.type(screen.getByRole("textbox"), "foo{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should allow to submit an empty value on enter if the parameter is not required", async () => {
      const { setValue } = setup({ value: ["foo"] });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(undefined);
    });

    it("should not allow to submit an empty value on enter if the parameter is required", async () => {
      const { setValue } = setup({
        value: ["foo"],
        parameter: createMockParameter({ required: true }),
      });
      const input = screen.getByRole("textbox");
      await userEvent.clear(input);
      await userEvent.type(input, "{enter}");
      expect(setValue).not.toHaveBeenLastCalledWith(undefined);
    });
  });

  describe("arity of n", () => {
    it("should render a token field input", () => {
      setup({ value: ["foo", "bar"], isMultiSelect: true });

      const values = screen.getAllByRole("list")[0];
      expect(values).toHaveTextContent("foobar");
    });

    it("should correctly parse number inputs", async () => {
      const { setValue } = setup({ value: undefined, isMultiSelect: true });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}bar{enter}baz{enter}");

      const button = screen.getByRole("button", { name: "Add filter" });
      await userEvent.click(button);
      expect(setValue).toHaveBeenCalledWith(["foo", "bar", "baz"]);
    });

    it("should be unsettable", async () => {
      const { setValue } = setup({
        value: ["foo", "bar"],
        isMultiSelect: true,
      });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "{backspace}{backspace}");
      const button = screen.getByRole("button", { name: "Update filter" });
      await userEvent.click(button);
      expect(setValue).toHaveBeenCalledWith(undefined);
    });

    it("should allow to submit a value on enter", async () => {
      const { setValue } = setup({ value: [], isMultiSelect: true });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo"]);
    });

    it("should allow to submit multiple values on enter", async () => {
      const { setValue } = setup({ value: [], isMultiSelect: true });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "foo,bar{enter}");
      expect(screen.getByText("foo")).toBeInTheDocument();
      expect(screen.getByText("bar")).toBeInTheDocument();
      expect(setValue).not.toHaveBeenCalled();

      await userEvent.type(input, "{enter}");
      expect(setValue).toHaveBeenCalledWith(["foo", "bar"]);
    });

    it("should allow to submit an empty value on enter if the parameter is not required", async () => {
      const { setValue } = setup({ value: ["foo"], isMultiSelect: true });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "{backspace}{enter}");
      expect(setValue).toHaveBeenCalledWith(undefined);
    });

    it("should not allow to submit an empty value on enter if the parameter is required", async () => {
      const { setValue } = setup({
        value: ["foo"],
        parameter: createMockParameter({ required: true }),
        isMultiSelect: true,
      });

      const input = screen.getByRole("combobox");
      await userEvent.type(input, "{backspace}{enter}");
      expect(setValue).not.toHaveBeenLastCalledWith(undefined);
    });
  });
});
