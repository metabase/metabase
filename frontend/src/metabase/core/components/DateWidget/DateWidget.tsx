import React, {
  forwardRef,
  HTMLAttributes,
  Ref,
  useCallback,
  useState,
} from "react";
import { Moment } from "moment";
import DateInput from "metabase/core/components/DateInput";
import DateSelector from "metabase/core/components/DateSelector";
import TippyPopover from "metabase/components/Popover/TippyPopover";

export interface DateWidgetProps extends HTMLAttributes<HTMLDivElement> {
  date?: Moment;
  onChangeDate?: (date?: Moment) => void;
}

const DateWidget = forwardRef(function DateWidget(
  { date, onChangeDate, ...props }: DateWidgetProps,
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
          onChangeDate={onChangeDate}
          onSubmit={handleClose}
        />
      }
      onHide={handleClose}
    >
      <DateInput
        {...props}
        ref={ref}
        value={date}
        hasCalendar
        onChange={onChangeDate}
        onCalendarClick={handleOpen}
      />
    </TippyPopover>
  );
});

export default DateWidget;
