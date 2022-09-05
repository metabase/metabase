import React, {
  forwardRef,
  HTMLAttributes,
  Key,
  Ref,
  useCallback,
  useMemo,
} from "react";
import _ from "underscore";
import { RadioColorScheme, RadioVariant } from "./types";
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

export interface RadioProps<TValue extends Key, TOption = RadioOption<TValue>>
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  name?: string;
  value?: TValue;
  options: TOption[];
  optionKeyFn?: (option: TOption) => Key;
  optionNameFn?: (option: TOption) => string;
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
  name: string;
  value: TValue;
}

function RadioInner<TValue extends Key, TOption = RadioOption<TValue>>(
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
): JSX.Element {
  const { RadioGroup } = VARIANTS[variant];
  const groupName = useMemo(() => name ?? _.uniqueId("radio-"), [name]);

  return (
    <RadioGroup
      {...props}
      role="radiogroup"
      ref={ref as any}
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
}

const Radio = forwardRef(RadioInner) as <T extends Key>(
  props: RadioProps<T> & { ref?: React.Ref<HTMLDivElement> },
) => ReturnType<typeof RadioInner>;

interface RadioItemProps<TValue extends Key> {
  name: string;
  checked: boolean;
  label: string;
  value: TValue;
  variant: RadioVariant;
  colorScheme: RadioColorScheme;
  disabled: boolean;
  vertical: boolean;
  showButtons: boolean;
  onChange?: (value: TValue) => void;
  onOptionClick?: (value: TValue) => void;
}

const RadioItem = <TValue extends Key, TOption>({
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
        value={value}
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

const getDefaultOptionKey = <TValue extends Key, TOption>(
  option: TOption,
): Key => {
  if (isDefaultOption<TValue>(option)) {
    return option.value;
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionName = <TValue extends Key, TOption>(
  option: TOption,
): string => {
  if (isDefaultOption(option)) {
    return option.name;
  } else {
    throw new TypeError();
  }
};

const getDefaultOptionValue = <TValue extends Key, TOption>(
  option: TOption,
): TValue => {
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

export default Object.assign(Radio, {
  RadioGroupVariants: [RadioGroupBubble, RadioGroupNormal],
  RadioLabelVariants: [RadioLabelBubble, RadioLabelNormal, RadioLabelText],
  RadioContainerVariants: [
    RadioContainerBubble,
    RadioContainerNormal,
    RadioContainerUnderlined,
  ],
});
