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

export const OTHER_VALUE_PLACEHOLDER = "__OTHER";
export const OTHER_LABEL = t`Other`;

type UnderlyingType = string | null;

const isOtherSelectValue = (selectValue: UnderlyingType) => {
  return selectValue === OTHER_VALUE_PLACEHOLDER;
};

export interface SelectWithOtherProps {
  className?: string;
  setting: {
    value: UnderlyingType;
    default: UnderlyingType;
    options: { value: string; name: string }[];
    placeholder?: string;
  };
  autoFocus?: boolean;
  onChange: (newValue: UnderlyingType) => void;
  disabled?: boolean;
}

/**
 * A widget which allows to choose a value from a list of options or input a different value.
 * Under the hood the widget consist of a `Select` component
 * and a `TextInput` shown only if "other" option is selected
 *
 * Automatically injects the placeholder for the "other" value into the supplied list of options
 */
export const SettingSelectWithOther: FunctionComponent<
  SelectWithOtherProps
> = ({
  className = "",
  setting,
  onChange,
  disabled = false,
  autoFocus = false,
}) => {
  const { value, options, placeholder } = setting;

  // to the format of "metabase/ui" select control
  const coercedOptions = (options || []).map(x => ({
    value: x.value,
    label: x.name,
  }));

  // append the "other" option to dropdown
  const populatedOptions = [
    ...coercedOptions,
    {
      label: OTHER_LABEL,
      value: OTHER_VALUE_PLACEHOLDER,
    },
  ];

  // look up for the raw value in the list of options
  // raw value might be null which means it should be the default one
  // in that case look up for the default value
  const effectiveValue = value ?? setting.default;
  const valueFoundInOptions = coercedOptions.filter(
    x => x.value === effectiveValue,
  )[0]?.value;

  const initSelectValue = valueFoundInOptions ?? OTHER_VALUE_PLACEHOLDER;
  const initTextValue = valueFoundInOptions ? null : value;

  const [selectValue, setSelectValue] =
    useState<UnderlyingType>(initSelectValue);
  const [textValue, setTextValue] = useState<UnderlyingType>(initTextValue);

  // update states when the compo
  useEffect(() => {
    setTextValue(initTextValue);
    setSelectValue(initSelectValue);
  }, [initSelectValue, initTextValue]);

  const handleSelectChange = useCallback(
    newValue => {
      setSelectValue(newValue);

      if (isOtherSelectValue(newValue)) {
        // display an empty text input to the user when switching to other value
        setTextValue(null);
      } else {
        onChange(newValue);
      }
    },
    [onChange],
  );

  const handleTextInputChange = useCallback<
    ChangeEventHandler<HTMLInputElement>
  >(e => {
    setTextValue(e.target.value);
  }, []);

  const handleTextInputBlur = useCallback<ChangeEventHandler<HTMLInputElement>>(
    e => {
      const newValue = e.target.value;

      if (
        newValue === "" || // do not update with null (default) values
        !isOtherSelectValue(selectValue) // just in case do not update if non-other option was selected
      ) {
        return;
      }

      onChange(newValue);
    },
    [onChange, selectValue],
  );

  return (
    <Stack>
      <Select
        className={cx("SettingsInput", className)}
        placeholder={placeholder}
        value={selectValue || ""}
        disabled={disabled}
        onChange={handleSelectChange}
        data={populatedOptions}
        autoFocus={autoFocus}
      />

      {isOtherSelectValue(selectValue) && (
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
