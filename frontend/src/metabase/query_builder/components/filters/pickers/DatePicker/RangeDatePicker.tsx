/* eslint-disable react/prop-types */
import React from "react";

import Calendar from "metabase/components/Calendar";

import moment from "moment";
import Filter from "metabase-lib/lib/queries/structured/Filter";
import { TimeContainer } from "./RangeDatePicker.styled";
import { setTimeComponent } from "metabase/lib/query_time";
import SingleDatePicker, { SingleDatePickerProps } from "./SingleDatePicker";
import SpecificDatePicker from "./SpecificDatePicker";
import { getTemporalUnit } from "./utils";
import { formatFilterDate } from "metabase/modes/lib/actions";

type BetweenPickerProps = {
  isSidebar?: boolean;
  className?: string;
  primaryColor?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;

  hideTimeSelectors?: boolean;
};

const getEndValue = (field: Filter, endValue: string) => {
  const temporalUnit = getTemporalUnit(field);
  if (!temporalUnit || temporalUnit === "day") {
    return endValue;
  }

  const end = formatFilterDate(
    moment(endValue).endOf(temporalUnit),
    temporalUnit,
  );
  return end;
};

export const BetweenPicker = ({
  className,
  isSidebar,
  filter: [op, field, startValue, endValue],
  onFilterChange,
  hideTimeSelectors,
  primaryColor,
}: BetweenPickerProps) => {
  if (op === "=") {
    endValue = startValue;
  }
  const normalizedEndValue = getEndValue(field, endValue);
  return (
    <div className={className}>
      <TimeContainer isSidebar={isSidebar}>
        <div>
          <SpecificDatePicker
            value={startValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onChange={value => onFilterChange([op, field, value, endValue])}
          />
        </div>
        <div>
          <SpecificDatePicker
            value={normalizedEndValue}
            primaryColor={primaryColor}
            hideTimeSelectors={hideTimeSelectors}
            onClear={() =>
              onFilterChange([
                op,
                field,
                setTimeComponent(startValue),
                setTimeComponent(endValue),
              ])
            }
            onChange={value => onFilterChange([op, field, startValue, value])}
          />
        </div>
      </TimeContainer>
      <div className="Calendar--noContext">
        <Calendar
          isRangePicker
          primaryColor={primaryColor}
          initial={startValue}
          selected={startValue && moment(startValue)}
          selectedEnd={endValue && moment(normalizedEndValue)}
          onChange={(startValue, endValue) =>
            onFilterChange([op, field, startValue, endValue])
          }
        />
      </div>
    </div>
  );
};

export const BeforePicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="before" />;
};

export const AfterPicker = (props: SingleDatePickerProps) => {
  return <SingleDatePicker {...props} selectAll="after" />;
};
