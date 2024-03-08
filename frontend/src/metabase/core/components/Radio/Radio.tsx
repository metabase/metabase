import type { HTMLAttributes, Key, ReactNode, Ref } from "react";
import { forwardRef, useCallback, useMemo } from "react";
import _ from "underscore";

import {
  RadioButton,
  RadioContainerBubble,
  RadioContainerNormal,
  RadioContainerUnderlined,
  RadioInput,
  RadioLabelBubble,
  RadioLabelNormal,
  RadioLabelText,
  RadioGroupBubble,
  RadioGroupNormal,
} from "./Radio.styled";
import type { RadioColorScheme, RadioVariant } from "./types";

const VARIANTS = {
  normal: {
    RadioGroup: RadioGroupNormal,
    RadioLabel: RadioLabelNormal,
    RadioContainer: RadioContainerNormal,
  },
  underlined: {
    RadioGroup: RadioGroupNormal,
    RadioLabel: RadioLabelNormal,
    RadioContainer: RadioContainerUnderlined,
  },
  bubble: {
    RadioGroup: RadioGroupBubble,
    RadioLabel: RadioLabelBubble,
    RadioContainer: RadioContainerBubble,
  },
};

export interface RadioProps<TValue, TOption = RadioOption<TValue>>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  name?: string;
  value?: TValue;
  options: TOption[];
  optionKeyFn?: (option: TOption) => Key;
  optionNameFn?: (option: TOption) => ReactNode;
  optionValueFn?: (option: TOption) => TValue;
  variant?: RadioVariant;
  colorScheme?: RadioColorScheme;
  disabled?: boolean;
  vertical?: boolean;
  showButtons?: boolean;
  onChange?: (value: TValue) => void;
  onOptionClick?: (value: TValue) => void;
}

export interface RadioOption<TValue> {
  name: ReactNode;
  value: TValue;
}

const BaseRadio = forwardRef(function Radio<
  TValue,
  TOption = RadioOption<TValue>,
>(
  {
    name,
    value,
    options,
    optionKeyFn = getDefaultOptionKey,
    optionNameFn = getDefaultOptionName,
    optionValueFn = getDefaultOptionValue,
    variant = "normal",
    colorScheme = "default",
    disabled = false,
    vertical = false,
    showButtons = vertical && variant !== "bubble",
    onChange,
    onOptionClick,
    ...props
  }: RadioProps<TValue, TOption>,
  ref: Ref<HTMLDivElement>,
) {
  const { RadioGroup } = VARIANTS[variant];
  const groupName = useMemo(() => name ?? _.uniqueId("radio-"), [name]);

  return (
    <RadioGroup
      {...props}
      role="radiogroup"
      ref={ref}
      variant={variant}
      vertical={vertical}
    >
      {options.map(option => {
        const optionKey = optionKeyFn(option);
        const optionName = optionNameFn(option);
        const optionValue = optionValueFn(option);
        const optionChecked = value === optionValue;

        return (
          <RadioItem
            key={optionKey}
            name={groupName}
            checked={optionChecked}
            label={optionName}
            value={optionValue}
            variant={variant}
            colorScheme={colorScheme}
            disabled={disabled}
            vertical={vertical}
            showButtons={showButtons}
            onChange={onChange}
            onOptionClick={onOptionClick}
          />
        );
      })}
    </RadioGroup>
  );
});

interface RadioItemProps<TValue> {
  name: string;
  checked: boolean;
  label: ReactNode;
  value: TValue;
  variant: RadioVariant;
  colorScheme: RadioColorScheme;
  disabled: boolean;
  vertical: boolean;
  showButtons: boolean;
  onChange?: (value: TValue) => void;
  onOptionClick?: (value: TValue) => void;
}

const RadioItem = <TValue,>({
  checked,
  name,
  label,
  value,
  variant,
  colorScheme,
  disabled,
  vertical,
  showButtons,
  onChange,
  onOptionClick,
}: RadioItemProps<TValue>): JSX.Element => {
  const { RadioLabel, RadioContainer } = VARIANTS[variant];

  const handleChange = useCallback(() => {
    onChange && onChange(value);
  }, [value, onChange]);

  const handleClick = useCallback(() => {
    onOptionClick && onOptionClick(value);
  }, [value, onOptionClick]);

  return (
    <RadioLabel variant={variant} vertical={vertical} onClick={handleClick}>
      <RadioInput
        type="radio"
        name={name}
        value={String(value)}
        checked={checked}
        disabled={disabled}
        onChange={handleChange}
      />
      <RadioContainer
        checked={checked}
        variant={variant}
        colorScheme={colorScheme}
        disabled={disabled}
        showButtons={showButtons}
      >
        {showButtons && (
          <RadioButton checked={checked} colorScheme={colorScheme} />
        )}
        <RadioLabelText>{label}</RadioLabelText>
      </RadioContainer>
    </RadioLabel>
  );
};

const getDefaultOptionKey = <TValue, TOption>(option: TOption): Key => {
  if (isDefaultOption<TValue>(option)) {
    return String(option.value);
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionName = <TValue, TOption>(option: TOption): ReactNode => {
  if (isDefaultOption<TValue>(option)) {
    return option.name;
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionValue = <TValue, TOption>(option: TOption): TValue => {
  if (isDefaultOption<TValue>(option)) {
    return option.value;
  } else {
    throw new TypeError();
  }
};

function isDefaultOption<TValue>(
  option: unknown,
): option is RadioOption<TValue> {
  return typeof option === "object";
}

/**
 * @deprecated: use Radio from "metabase/ui"
 */
const Radio = Object.assign(BaseRadio, {
  RadioGroupVariants: [RadioGroupBubble, RadioGroupNormal],
  RadioLabelVariants: [RadioLabelBubble, RadioLabelNormal],
  RadioLabelText: RadioLabelText,
  RadioContainerVariants: [
    RadioContainerBubble,
    RadioContainerNormal,
    RadioContainerUnderlined,
  ],
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Radio;
