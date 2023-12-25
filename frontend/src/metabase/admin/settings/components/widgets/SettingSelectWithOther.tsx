/* eslint-disable react/prop-types */
import cx from "classnames";
import type { ChangeEventHandler } from "react";
import {
  useCallback,
  type FunctionComponent,
  useState,
  useEffect,
} from "react";

import { t } from "ttag";
import { Select, Stack, TextInput } from "metabase/ui";

import type { SettingElement } from "../../types";

export const OTHER_VALUE_PLACEHOLDER = "__OTHER";
export const OTHER_LABEL = t`other`;

const isValueIsOther = (value: string | null) => {
  return value === OTHER_VALUE_PLACEHOLDER;
};

interface SelectWithOtherProps<T> {
  className: string;
  setting: SettingElement & { value: T; default: T };
  onChange: any;
  disabled: boolean;
}

export const SettingSelectWithOther: FunctionComponent<
  SelectWithOtherProps<string>
> = ({ className = "", setting, onChange, disabled = false }) => {
  const coercedOptions = (setting.options || []).map(option => {
    return { value: option.value as string, label: option.name };
  });

  const other = {
    label: OTHER_LABEL,
    value: OTHER_VALUE_PLACEHOLDER,
  } as const;

  const populatedOptions = [...coercedOptions, other];

  const valueToSearchInOptions = setting.value ?? setting.default;

  const valueFoundInOptions = coercedOptions.filter(
    x => x.value === valueToSearchInOptions,
  )[0]?.value;

  const initSelectValue = valueFoundInOptions ?? OTHER_VALUE_PLACEHOLDER;
  const initSelectValueAsStr = initSelectValue;

  const [selectValue, setSelectValue] = useState<string>(initSelectValueAsStr);
  const [textValue, setTextValue] = useState<string>();

  useEffect(() => {
    setTextValue(valueToSearchInOptions);
    setSelectValue(initSelectValueAsStr);
  }, [initSelectValueAsStr, setting.value, valueToSearchInOptions]);

  const handleSelectChange = useCallback(
    value => {
      setSelectValue(value);
      if (!isValueIsOther(value)) {
        setTextValue(value);
        onChange(value);
      }
    },
    [onChange],
  );

  const handleTextInputChange = useCallback<
    ChangeEventHandler<HTMLInputElement>
  >(e => {
    const value = e.target.value;
    setTextValue(value);
  }, []);

  const handleTextInputBlur = useCallback<ChangeEventHandler<HTMLInputElement>>(
    e => {
      const value = e.target.value;
      setTextValue(value);
      if (isValueIsOther(selectValue)) {
        onChange(value);
      }
    },
    [onChange, selectValue],
  );

  return (
    <Stack>
      <Select
        className={cx("SettingsInput", className)}
        placeholder={setting.placeholder}
        value={selectValue || ""}
        disabled={disabled}
        onChange={handleSelectChange}
        data={populatedOptions}
      />

      {isValueIsOther(selectValue) && (
        <TextInput
          className={cx("SettingsInput", className)}
          value={textValue || ""}
          onChange={handleTextInputChange}
          onBlur={handleTextInputBlur}
          disabled={disabled}
        />
      )}
    </Stack>
  );
};
