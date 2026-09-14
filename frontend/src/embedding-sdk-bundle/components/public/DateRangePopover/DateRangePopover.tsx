import {
  Children,
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  cloneElement,
  isValidElement,
  useState,
} from "react";

import { Popover } from "metabase/ui";

import {
  DateRangeCalendar,
  type DateRangeCalendarProps,
  type DateRangeValue,
} from "../DateRangeCalendar/DateRangeCalendar";

export interface DateRangePopoverProps extends Omit<
  DateRangeCalendarProps,
  "className" | "style"
> {
  /**
   * The trigger. Must be a single DOM element or a `forwardRef` component: the
   * popover attaches a ref and a click handler to it.
   */
  children: ReactElement<{ onClick?: (event: MouseEvent) => void }>;
  opened?: boolean;
  onOpenedChange?: (opened: boolean) => void;
  /** Close once both ends of the range are picked. Defaults to true. */
  closeOnSelect?: boolean;
  position?: ComponentProps<typeof Popover>["position"];
}

export const DateRangePopover = ({
  children,
  opened,
  onOpenedChange,
  closeOnSelect = true,
  position = "bottom-start",
  onChange,
  ...calendarProps
}: DateRangePopoverProps) => {
  const [internalOpened, setInternalOpened] = useState(false);
  const isOpened = opened ?? internalOpened;

  const setOpened = (next: boolean) => {
    setInternalOpened(next);
    onOpenedChange?.(next);
  };

  const handleChange = (next: DateRangeValue) => {
    onChange?.(next);

    if (closeOnSelect && next[0] && next[1]) {
      setOpened(false);
    }
  };

  const trigger = Children.only(children);

  if (!isValidElement(trigger)) {
    return null;
  }

  return (
    <Popover
      opened={isOpened}
      onChange={setOpened}
      position={position}
      withinPortal
    >
      <Popover.Target>
        {cloneElement(trigger, {
          onClick: (event: MouseEvent) => {
            trigger.props.onClick?.(event);
            setOpened(!isOpened);
          },
        })}
      </Popover.Target>

      <Popover.Dropdown p="md">
        <DateRangeCalendar {...calendarProps} onChange={handleChange} />
      </Popover.Dropdown>
    </Popover>
  );
};
