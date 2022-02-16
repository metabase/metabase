import React, {
  ChangeEvent,
  FocusEvent,
  forwardRef,
  HTMLAttributes,
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

const DATE_FORMAT = "MM/DD/YYYY";

export type DateInputAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  autoFocus?: boolean;
  onChange?: (value: Moment | undefined) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

const DateInput = forwardRef(function DateInput(
  {
    value,
    placeholder,
    readOnly,
    disabled,
    error,
    fullWidth,
    autoFocus,
    onChange,
    onFocus,
    onBlur,
    ...props
  }: DateInputProps,
  ref: Ref<HTMLDivElement>,
) {
  const [text, setText] = useState(() => value?.format(DATE_FORMAT));
  const [isOpened, setIsOpened] = useState(false);
  const initialValue = useMemo(() => moment(), []);
  const initialPlaceholder = useMemo(() => moment().format(DATE_FORMAT), []);

  const handleIconClick = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleSaveClick = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handlePopoverClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = moment(newText, DATE_FORMAT);
      setText(newText);

      if (newValue.isValid()) {
        onChange?.(newValue);
      } else {
        onChange?.(undefined);
      }
    },
    [onChange],
  );

  const handleInputBlur = useCallback(
    (event: FocusEvent<HTMLInputElement>) => {
      const newText = event.target.value;
      const newValue = moment(newText, DATE_FORMAT);

      if (newValue.isValid()) {
        setText(newValue.format(DATE_FORMAT));
      } else {
        setText("");
      }

      onBlur?.(event);
    },
    [onBlur],
  );

  const handleCalendarChange = useCallback(
    (newText: string) => {
      const newValue = moment(newText);
      setText(newValue.format(DATE_FORMAT));
      onChange?.(newValue);
    },
    [onChange],
  );

  return (
    <TippyPopover
      trigger="manual"
      placement="bottom"
      visible={isOpened}
      interactive
      content={
        <div>
          <Calendar
            selected={value}
            initial={initialValue}
            onChange={handleCalendarChange}
            isRangePicker={false}
          />
          <CalendarFooter>
            <Button primary onClick={handleSaveClick}>{t`Save`}</Button>
          </CalendarFooter>
        </div>
      }
      onHide={handlePopoverClose}
    >
      <InputRoot
        ref={ref}
        readOnly={readOnly}
        error={error}
        fullWidth={fullWidth}
        {...props}
      >
        <Input
          value={text}
          placeholder={placeholder ?? initialPlaceholder}
          readOnly={readOnly}
          disabled={disabled}
          error={error}
          fullWidth={fullWidth}
          autoFocus={autoFocus}
          borderless
          onChange={handleInputChange}
          onFocus={onFocus}
          onBlur={handleInputBlur}
        />
        {!readOnly && !disabled && (
          <Tooltip tooltip={isOpened ? t`Hide calendar` : t`Open calendar`}>
            <InputIconButton tabIndex={-1} onClick={handleIconClick}>
              <Icon name="calendar" />
            </InputIconButton>
          </Tooltip>
        )}
      </InputRoot>
    </TippyPopover>
  );
});

export default DateInput;
