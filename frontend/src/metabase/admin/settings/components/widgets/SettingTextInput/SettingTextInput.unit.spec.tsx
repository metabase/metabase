import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SettingTextInput } from "./SettingTextInput";

type Value = string | null;

interface SetupOpts {
  setting: Setting;
  value: Value;
  type: "text" | "password";
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
    <SettingTextInput
      setting={{ ...setting, value: String(value) }}
      onChange={onChange}
      type={type}
      normalize={normalize}
    />,
  );

  return { onChange };
}

describe("SettingTextInput (metabase/ui)", () => {
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
