import { checkNotNull } from "metabase/lib/types";
import { Select } from "metabase/ui";

import type { SettingElement } from "../../types";

interface SettingSelectProps {
  id?: string;
  className?: string;
  setting: SettingElement;
  options: SettingElement["options"];
  onChange: (value: SettingElement["value"]) => void;
  disabled?: boolean;
}

export const SettingSelect = ({
  id,
  className,
  setting: { placeholder, value, options, defaultValue },
  options: customOptions = options,
  onChange,
  disabled = false,
}: SettingSelectProps) => (
  <>
    <Select
      id={id}
      className={className}
      placeholder={placeholder}
      value={(value as string) ?? defaultValue}
      disabled={disabled}
      onChange={value => onChange(value)}
      data={checkNotNull(customOptions).map(option => {
        return {
          label: option.name,
          value: option.value as string,
        };
      })}
    />
  </>
);
