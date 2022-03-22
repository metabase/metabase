import React, {
  forwardRef,
  InputHTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { Moment } from "moment";
import DateInput from "metabase/core/components/DateInput";
import DateSelector from "metabase/core/components/DateSelector";
import TippyPopover from "metabase/components/Popover/TippyPopover";

export type DateWidgetAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateWidgetProps extends DateWidgetAttributes {
  value?: Moment;
  hasTime?: boolean;
  dateFormat?: string;
  timeFormat?: string;
  is24HourMode?: boolean;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (date?: Moment) => void;
}

const DateWidget = forwardRef(function DateWidget(
  {
    value,
    hasTime,
    dateFormat,
    timeFormat,
    is24HourMode,
    error,
    fullWidth,
    onChange,
    ...props
  }: DateWidgetProps,
  ref: Ref<HTMLDivElement>,
): JSX.Element {
  const [isOpened, setIsOpened] = useState(false);

  const handleOpen = useCallback(() => {
    setIsOpened(true);
  }, []);

  const handleClose = useCallback(() => {
    setIsOpened(false);
  }, []);

  return (
    <TippyPopover
      visible={isOpened}
      placement="bottom-start"
      content={
        <DateSelector
          value={value}
          hasTime={hasTime}
          is24HourMode={is24HourMode}
          onChange={onChange}
          onSubmit={handleClose}
        />
      }
      onHide={handleClose}
    >
      <DateInput
        {...props}
        ref={ref}
        value={value}
        hasTime={hasTime}
        hasCalendar={true}
        dateFormat={dateFormat}
        timeFormat={timeFormat}
        error={error}
        fullWidth={fullWidth}
        onChange={onChange}
        onCalendarClick={handleOpen}
      />
    </TippyPopover>
  );
});

export default DateWidget;
