import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  InputHTMLAttributes,
  Ref,
  useCallback,
  useMemo,
  useState,
} from "react";
import moment, { Moment } from "moment";
import { t } from "ttag";
import Button from "metabase/core/components/Button";
import Input from "metabase/core/components/Input";
import Icon from "metabase/components/Icon";
import Calendar from "metabase/components/Calendar";
import Tooltip from "metabase/components/Tooltip";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { CalendarFooter, InputIconButton, InputRoot } from "./DateInput.styled";

const INPUT_FORMAT = "MM/DD/YYYY";
const CALENDAR_FORMAT = "YYYY-MM-DD";

export type DateInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (value: Moment | undefined) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    className,
    style,
    value,
    placeholder,
    readOnly,
    disabled,
    error,
    fullWidth,
    onFocus,
    onBlur,
    onChange,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const now = useMemo(() => moment(), []);
  const nowText = useMemo(() => now.format(INPUT_FORMAT), [now]);
  const valueText = useMemo(() => value?.format(INPUT_FORMAT) ?? "", [value]);
  const [inputText, setInputText] = useState(valueText);
  const [isOpened, setIsOpened] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const handleInputFocus = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      setInputText(valueText);
      onFocus?.(event);
    },
    [valueText, onFocus],
  );

  const handleInputBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = moment(newText, INPUT_FORMAT);
      setInputText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  const handlePopoverOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleCalendarChange = useCallback(
    (valueText: string) => {
      const value = moment(valueText, CALENDAR_FORMAT);
      onChange?.(value);
    },
    [onChange],
  );

  return (
    <TippyPopover
      trigger="manual"
      placement="bottom-start"
      visible={isOpened}
      interactive
      content={
        <div>
          <Calendar
            selected={value}
            initial={value ?? now}
            onChange={handleCalendarChange}
            isRangePicker={false}
          />
          <CalendarFooter>
            <Button primary onClick={handlePopoverClose}>{t`Save`}</Button>
          </CalendarFooter>
        </div>
      }
      onHide={handlePopoverClose}
    >
      <InputRoot
        ref={ref}
        className={className}
        style={style}
        readOnly={readOnly}
        error={error}
        fullWidth={fullWidth}
      >
        <Input
          {...props}
          value={isFocused ? inputText : valueText}
          placeholder={nowText}
          readOnly={readOnly}
          disabled={disabled}
          error={error}
          fullWidth={fullWidth}
          borderless
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          onChange={handleInputChange}
        />
        {!readOnly && !disabled && (
          <Tooltip tooltip={t`Show calendar`}>
            <InputIconButton tabIndex={-1} onClick={handlePopoverOpen}>
              <Icon name="calendar" />
            </InputIconButton>
          </Tooltip>
        )}
      </InputRoot>
    </TippyPopover>
  );
});

export default DateInput;
