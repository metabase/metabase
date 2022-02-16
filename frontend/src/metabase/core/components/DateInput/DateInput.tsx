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
import Input from "metabase/core/components/Input";
import Calendar from "metabase/components/Calendar";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { InputIcon, InputIconContainer, InputRoot } from "./DateInput.styled";

const DATE_FORMAT = "MM/DD/YYYY";

export type DateInputAttributes = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "onFocus" | "onBlur"
>;

export interface DateInputProps extends DateInputAttributes {
  value?: Moment;
  placeholder?: string;
  readOnly?: boolean;
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
    setIsOpened(isOpened => !isOpened);
  }, []);

  const handlePopoverHide = useCallback(() => {
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
      setIsOpened(false);
      onChange?.(newValue);
    },
    [onChange],
  );

  return (
    <TippyPopover
      visible={isOpened}
      placement="bottom"
      content={
        <Calendar
          selected={value}
          initial={initialValue}
          onChange={handleCalendarChange}
          isRangePicker={false}
        />
      }
      interactive
      onHide={handlePopoverHide}
    >
      <InputRoot ref={ref} readOnly={readOnly} fullWidth={fullWidth} {...props}>
        <Input
          value={text}
          placeholder={placeholder ?? initialPlaceholder}
          readOnly={readOnly}
          fullWidth={fullWidth}
          autoFocus={autoFocus}
          borderless
          onChange={handleInputChange}
          onFocus={onFocus}
          onBlur={handleInputBlur}
        />
        <InputIconContainer onClick={handleIconClick}>
          <InputIcon
            name="calendar"
            tooltip={isOpened ? t`Hide calendar` : t`Show calendar`}
          />
        </InputIconContainer>
      </InputRoot>
    </TippyPopover>
  );
});

export default DateInput;
