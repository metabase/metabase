import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingSelectWithOther } from "./SettingSelectWithOther";

type Value = string | null;

interface SetupOpts {
  key: string;
  value: Value;
  defaultValue: string;
  options: { name: string; value: string }[];
}

function setup({ key, value, defaultValue, options }: SetupOpts) {
  const onChange = jest.fn();
  render(
    <SettingSelectWithOther
      key={key}
      setting={{
        options: options,
        default: defaultValue,
        value: value,
      }}
      onChange={onChange}
      className={""}
      disabled={false}
    />,
  );

  return { onChange };
}

const commonOptions = [
  {
    value: "1",
    name: "one",
  },
  {
    value: "2",
    name: "two",
  },
  {
    value: "3",
    name: "three",
  },
];

describe("SettingSelectWithOther", () => {
  it("should correctly display the default value", () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: null,
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    const searchBox = screen.getByRole("searchbox");
    const textInput = screen.queryByRole("textbox");

    expect(searchBox).toBeInTheDocument();
    expect(textInput).not.toBeInTheDocument();
    expect(searchBox).toHaveValue("one");
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it("should correctly display a value from the options", () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: "2",
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    const searchBox = screen.getByRole("searchbox");
    const textInput = screen.queryByRole("textbox");

    expect(searchBox).toBeInTheDocument();
    expect(textInput).not.toBeInTheDocument();
    expect(searchBox).toHaveValue("two");
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it('should correctly display the "other" value', () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: "some other",
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    const searchBox = screen.getByRole("searchbox");
    const textInput = screen.getByRole("textbox");

    expect(searchBox).toBeInTheDocument();
    expect(textInput).toBeInTheDocument();
    expect(textInput).toHaveValue("some other");
    expect(searchBox).toHaveValue("Other");
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it("should correctly switch from a value from the options to another one", () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: null,
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    userEvent.click(screen.getByRole("searchbox"));
    userEvent.click(screen.getByText("two"));

    const textInput = screen.queryByRole("textbox");
    expect(textInput).not.toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it('should display textbox when switching to the "other" value', () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: null,
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    userEvent.click(screen.getByRole("searchbox"));
    userEvent.click(screen.getByText("Other"));

    // do not type anything

    const textInput = screen.getByRole("textbox");

    expect(textInput).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it("should not call onChange before a user finishes inputting the value into the textbox", () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: null,
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    userEvent.click(screen.getByRole("searchbox"));
    userEvent.click(screen.getByText("Other"));

    const textInput = screen.getByRole("textbox");

    // input something
    userEvent.type(textInput, "something");
    // do no blur

    expect(textInput).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(0);
  });

  it('should call onChange after the "other" value has been input', () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: null,
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    userEvent.click(screen.getByRole("searchbox"));
    userEvent.click(screen.getByText("Other"));

    const textInput = screen.getByRole("textbox");

    // input something
    userEvent.type(textInput, "something");
    // blur
    userEvent.tab();

    expect(textInput).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledWith("something");
  });

  it('should correctly switch from the "other" value to the value from the options', () => {
    const setupOpts: SetupOpts = {
      key: "test",
      value: "some other",
      defaultValue: "1",
      options: commonOptions,
    };
    const { onChange } = setup(setupOpts);

    const searchBox = screen.getByRole("searchbox");

    userEvent.click(searchBox);
    userEvent.click(screen.getByText("two"));

    const textInput = screen.queryByRole("textbox");

    expect(searchBox).toBeInTheDocument();
    expect(textInput).not.toBeInTheDocument();
    expect(searchBox).toHaveValue("two");
    expect(onChange).toHaveBeenCalledWith("2");
  });
});
