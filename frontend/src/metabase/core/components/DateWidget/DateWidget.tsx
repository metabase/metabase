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
import { TimezoneOption } from "./types";

export type DateWidgetAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateWidgetProps extends DateWidgetAttributes {
  date?: Moment;
  hasTime?: boolean;
  timezone?: string;
  timezones?: TimezoneOption[];
  hasTimezone?: boolean;
  dateFormat?: string;
  timeFormat?: string;
  error?: boolean;
  fullWidth?: boolean;
  onChangeDate?: (date?: Moment) => void;
  onChangeTimezone?: (timezone: string) => void;
}

const DateWidget = forwardRef(function DateWidget(
  {
    date,
    timezone,
    timezones,
    hasTime,
    hasTimezone,
    dateFormat,
    timeFormat,
    error,
    fullWidth,
    onChangeDate,
    onChangeTimezone,
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
      trigger="manual"
      placement="bottom-start"
      visible={isOpened}
      interactive
      content={
        <DateSelector
          date={date}
          hasTime={hasTime}
          timezone={timezone}
          timezones={timezones}
          hasTimezone={hasTimezone}
          onChangeDate={onChangeDate}
          onChangeTimezone={onChangeTimezone}
          onSubmit={handleClose}
        />
      }
      onHide={handleClose}
    >
      <DateInput
        {...props}
        ref={ref}
        value={date}
        hasTime={hasTime}
        hasCalendar={true}
        dateFormat={dateFormat}
        timeFormat={timeFormat}
        error={error}
        fullWidth={fullWidth}
        onChange={onChangeDate}
        onCalendarClick={handleOpen}
      />
    </TippyPopover>
  );
});

export default DateWidget;
