import React from "react";

import { formatBucketing } from "metabase/lib/query_time";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { DATE_PERIODS } from "../RelativeDatePicker";
import {
  CurrentButton,
  CurrentContainer,
  CurrentPopover,
} from "./CurrentPicker.styled";
import { periodPopoverText } from "./periodPopoverText";

type CurrentPickerProps = {
  className?: string;
  filter: Filter;
  primaryColor?: string;
  onCommit: (filter?: any[]) => void;
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
