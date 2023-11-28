import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import InputWithSelectPrefix from "./InputWithSelectPrefix";

const setup = ({ initialValue = "" }: { initialValue?: string } = {}) => {
  const onChange = jest.fn();
  render(
    <InputWithSelectPrefix
      prefixes={["https://", "http://", "ftp://"]}
      defaultPrefix="https://"
      value={initialValue}
      onChange={onChange}
    />,
  );
  return { onChange };
};

describe("InputWithSelectPrefix", () => {
  it("should allow pasting a value containing the prefix", () => {
    setup();
    userEvent.paste(textField(), "http://example.com/help");

    expect(screen.getByText("http://")).toBeInTheDocument();
    expect(screen.queryByText("https://")).not.toBeInTheDocument();

    expect(textField()).toHaveValue("example.com/help");
  });

  it("should not call onChange when changing prefix with an empty text field", () => {
    const { onChange } = setup();

    openSelect();
    userEvent.click(screen.getByText("http://"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("should call onChange when changing prefix with a non-empty text field", () => {
    const { onChange } = setup({ initialValue: "https://example.com" });

    openSelect();
    userEvent.click(screen.getByText("http://"));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: { value: "http://example.com" } }),
    );
  });

  it("should call onChange when blurring the text field", () => {
    const { onChange } = setup({ initialValue: "https://example.com/hello" });

    userEvent.tab();

    openSelect();
    userEvent.click(screen.getByText("http://"));

    userEvent.clear(textField());
    userEvent.type(textField(), "example.com/help");

    userEvent.tab();

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ target: { value: "http://example.com/help" } }),
    );
  });
});

const openSelect = () => userEvent.click(screen.getByRole("button"));
const textField = () => screen.getByRole("textbox");
