import type { Moment } from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import type { InputHTMLAttributes, Ref } from "react";
import { forwardRef, useCallback, useState } from "react";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import DateInput from "metabase/core/components/DateInput";
import DateSelector from "metabase/core/components/DateSelector";

export type DateWidgetAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "onChange"
>;

export interface DateWidgetProps extends DateWidgetAttributes {
  value?: Moment;
  hasTime?: boolean;
  dateFormat?: string;
  timeFormat?: string;
  error?: boolean;
  fullWidth?: boolean;
  onChange?: (date?: Moment) => void;
  onHasTimeChange?: (hasTime: boolean) => void;
}

const DateWidget = forwardRef(function DateWidget(
  {
    value,
    hasTime,
    dateFormat,
    timeFormat,
    error,
    fullWidth,
    onChange,
    onHasTimeChange,
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
          timeFormat={timeFormat}
          onChange={onChange}
          onHasTimeChange={onHasTimeChange}
          onSubmit={handleClose}
        />
      }
      onClickOutside={handleClose}
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateWidget;
