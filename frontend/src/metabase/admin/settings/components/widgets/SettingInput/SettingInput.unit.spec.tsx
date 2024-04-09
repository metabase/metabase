import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingInput } from "./SettingInput";

type Value = string | number | null;

interface SetupOpts {
  setting: Setting;
  value: Value;
  type: string;
  normalize?: (value: Value) => Value;
}

interface Setting {
  key: string;
  value?: string;
  default?: string;
  placeholder?: string;
  display_name?: string;
  type?: string;
}

function setup({ setting, value, type, normalize }: SetupOpts) {
  const onChange = jest.fn();
  render(
    <SettingInput
      setting={{ ...setting, value: String(value) }}
      onChange={onChange}
      type={type}
      normalize={normalize}
    />,
  );

  return { onChange };
}

describe("SettingInput", () => {
  it("when type=number should allow decimal values", async () => {
    const setting = {
      key: "test",
      value: "100",
      default: "100",
      placeholder: "numeric value",
    };
    const { onChange } = setup({ setting, value: 100, type: "number" });

    await userEvent.type(screen.getByPlaceholderText("numeric value"), ".25");
    await userEvent.tab(); // blur

    expect(onChange).toHaveBeenCalledWith(100.25);
  });

  describe("normalize value (metabase#25482)", () => {
    const setting = {
      key: "landing-page",
      display_name: "Landing Page",
      type: "string",
      placeholder: "/",
    };

    function normalize(value: Value) {
      if (typeof value === "string") {
        const normalizedValue = value.trim();
        return normalizedValue === "" ? null : normalizedValue;
      }

      return value;
    }
    it("should render the input", () => {
      const value = "/";
      setup({ setting, value, type: "text", normalize });

      expect(screen.getByDisplayValue(value)).toBeInTheDocument();
    });

    it("should call onChange without leading or trailing spaces string", async () => {
      const value = "/";
      const { onChange } = setup({ setting, value, type: "text", normalize });

      const input = screen.getByDisplayValue(value);
      await userEvent.clear(input);
      await userEvent.type(input, "  /  ");
      input.blur();
      expect(onChange).toHaveBeenCalledWith("/");
    });

    it("should call onChange with null", async () => {
      const value = "/";
      const { onChange } = setup({ setting, value, type: "text", normalize });

      const input = screen.getByDisplayValue(value);
      await userEvent.clear(input);
      input.blur();
      expect(onChange).toHaveBeenCalledWith(null);
    });

    it("should call onChange with number", async () => {
      const value = "1";
      const { onChange } = setup({ setting, value, type: "number", normalize });

      const input = screen.getByDisplayValue(value);
      await userEvent.clear(input);
      await userEvent.type(input, "2");
      input.blur();
      expect(onChange).toHaveBeenCalledWith(2);
    });

    it("should not call onChange when blurring without changing anything", () => {
      const value = "/";
      const { onChange } = setup({ setting, value, type: "text", normalize });

      const input = screen.getByDisplayValue(value);
      input.focus();
      input.blur();
      expect(onChange).not.toHaveBeenCalled();
    });
  });
});
