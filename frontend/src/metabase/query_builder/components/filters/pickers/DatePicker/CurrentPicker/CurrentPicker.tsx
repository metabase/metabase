import React from "react";
import { t } from "ttag";
import moment from "moment";

import { formatBucketing } from "metabase/lib/query_time";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import { DATE_PERIODS } from "../RelativeDatePicker";
import {
  CurrentButton,
  CurrentContainer,
  CurrentPopover,
} from "./CurrentPicker.styled";
import Filter from "metabase-lib/lib/queries/structured/Filter";

type CurrentPickerProps = {
  className?: string;
  filter: Filter;
  primaryColor?: string;
  onCommit: (filter?: any[]) => void;
};

const periodPopoverText = (period: string) => {
  const now = moment();
  let start: string, end: string;
  switch (period) {
    case "day":
      return t`Right now, this is ${now.format("ddd, MMM D")}`;
    case "week":
      start = now.startOf("week").format("ddd, MMM D");
      end = now.endOf("week").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "month":
      start = now.startOf("month").format("ddd, MMM D");
      end = now.endOf("month").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "quarter":
      start = now.startOf("quarter").format("ddd, MMM D");
      end = now.endOf("quarter").format("ddd, MMM D");
      return t`Right now, this is ${start} - ${end}`;
    case "year":
      start = now.startOf("year").format("MMM D, YYYY");
      end = now.endOf("year").format("MMM D, YYYY");
      return t`Right now, this is ${start} - ${end}`;
  }
};

export default function CurrentPicker(props: CurrentPickerProps) {
  const {
    className,
    primaryColor,
    onCommit,
    filter: [operator, field, _intervals, unit],
  } = props;
  return (
    <div className={className} data-testid="current-date-picker">
      {DATE_PERIODS.map((periods, index) => (
        <CurrentContainer key={periods.length} first={index === 0}>
          {periods.map(period => (
            <TippyPopover
              key={period}
              placement="bottom"
              delay={[500, null]}
              content={
                <CurrentPopover>{periodPopoverText(period)}</CurrentPopover>
              }
            >
              <CurrentButton
                key={period}
                primaryColor={primaryColor}
                selected={operator && unit === period.toLowerCase()}
                onClick={() => {
                  onCommit([operator, field, "current", period]);
                }}
              >
                {formatBucketing(period, 1)}
              </CurrentButton>
            </TippyPopover>
          ))}
        </CurrentContainer>
      ))}
    </div>
  );
}
