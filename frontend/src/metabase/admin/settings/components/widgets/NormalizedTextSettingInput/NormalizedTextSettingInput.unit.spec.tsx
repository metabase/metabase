import userEvent from "@testing-library/user-event";
import { render, screen } from "__support__/ui";
import { NormalizedTextSettingInput } from "./NormalizedTextSettingInput";

interface SetupOpts {
  value: string | number | null;
  type: string;
}

function setup({ value, type }: SetupOpts) {
  const setting = {
    key: "landing-page",
    value: String(value),
    display_name: "Landing Page",
    type: "string",
    placeholder: "/",
  };
  const onChange = jest.fn();
  render(
    <NormalizedTextSettingInput
      setting={setting}
      onChange={onChange}
      type={type}
    />,
  );

  return { onChange };
}

describe("NormalizedTextSettingInput (metabase#25482)", () => {
  it("should render the input", () => {
    const value = "/";
    setup({ value, type: "text" });

    expect(screen.getByDisplayValue(value)).toBeInTheDocument();
  });

  it("should  call onChange without leading or trailing spaces string", () => {
    const value = "/";
    const { onChange } = setup({ value, type: "text" });

    const input = screen.getByDisplayValue(value);
    userEvent.clear(input);
    userEvent.type(input, "  /  ");
    input.blur();
    expect(onChange).toHaveBeenCalledWith("/");
  });

  it("should not onChange with null", () => {
    const value = "/";
    const { onChange } = setup({ value, type: "text" });

    const input = screen.getByDisplayValue(value);
    userEvent.clear(input);
    input.blur();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("should not onChange with number", () => {
    const value = "1";
    const { onChange } = setup({ value, type: "number" });

    const input = screen.getByDisplayValue(value);
    userEvent.clear(input);
    userEvent.type(input, "2");
    input.blur();
    expect(onChange).toHaveBeenCalledWith(2);
  });
});
