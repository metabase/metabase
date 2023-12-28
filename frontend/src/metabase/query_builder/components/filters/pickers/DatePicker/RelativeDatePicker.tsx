import { useState } from "react";
import { t } from "ttag";
import { assoc } from "icepick";
// eslint-disable-next-line no-restricted-imports -- deprecated usage
import type { DurationInputArg2 } from "moment-timezone";
import { isValidTimeInterval } from "metabase/lib/time";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import {
  formatStartingFrom,
  getRelativeDatetimeInterval,
  getStartingFrom,
  setRelativeDatetimeUnit,
  setRelativeDatetimeValue,
  setStartingFrom,
  toTimeInterval,
} from "metabase-lib/queries/utils/query-time";

import type Filter from "metabase-lib/queries/structured/Filter";
import {
  GridContainer,
  GridText,
  MoreButton,
  OptionButton,
  OptionsContainer,
  DateUnitSelector,
  NumericInput,
} from "./RelativeDatePicker.styled";

type RelativeDatePickerProps = {
  className?: string;
  filter: Filter;
  onFilterChange: (filter: any[]) => void;
  formatter?: (value: number) => number;
  offsetFormatter?: (value: number) => number;
  primaryColor?: string;
  reverseIconDirection?: boolean;
  supportsExpressions?: boolean;
};

type OptionsContentProps = RelativeDatePickerProps & {
  setOptionsVisible: (shouldBeVisible: boolean) => void;
};

const CURRENT_INTERVAL_NAME = {
  day: t`today`,
  week: t`this week`,
  month: t`this month`,
  year: t`this year`,
  quarter: t`this quarter`,
  minute: t`this minute`,
  hour: t`this hour`,
};

export const DATE_PERIODS = [
  ["day", "week", "month"],
  ["quarter", "year"],
];

const TIME_PERIODS = ["minute", "hour"];

// define ALL_PERIODS in increasing order of duration
const ALL_PERIODS = TIME_PERIODS.concat(DATE_PERIODS.flat());

const SELECT_STYLE = {
  width: 65,
  fontSize: 14,
  fontWeight: 700,
};

const isSmallerUnit = (unit: string, unitToCompare: string) => {
  return ALL_PERIODS.indexOf(unit) < ALL_PERIODS.indexOf(unitToCompare);
};

const getStartingFromUnits = (
  filterUnit: string,
  selectedStartingFromUnit: string,
) => {
  const largerUnits = ALL_PERIODS.filter(
    period => !isSmallerUnit(period, filterUnit),
  );

  if (!largerUnits.includes(selectedStartingFromUnit)) {
    largerUnits.unshift(selectedStartingFromUnit);
  }

  return largerUnits;
};

const getCurrentString = (filter: Filter) =>
  t`Include ${getCurrentIntervalName(filter)}`;

function getCurrentIntervalName(filter: Filter) {
  if (filter[0] === "time-interval") {
    return CURRENT_INTERVAL_NAME[
      filter[3] as keyof typeof CURRENT_INTERVAL_NAME
    ];
  }
  return null;
}

const OptionsContent = ({
  filter,
  primaryColor,
  onFilterChange,
  reverseIconDirection,
  setOptionsVisible,
  supportsExpressions,
}: OptionsContentProps) => {
  const options = filter[4] || {};
  const includeCurrent = !!options["include-current"];
  const currentString = getCurrentString(filter);

  const handleClickOnStartingFrom = () => {
    setOptionsVisible(false);
    onFilterChange(setStartingFrom(filter));
  };

  const handleClickOnIncludeCurrentTimeUnit = () => {
    setOptionsVisible(false);
    onFilterChange(
      assoc(filter, 4, {
        ...options,
        "include-current": !includeCurrent,
      }),
    );
  };

  return (
    <OptionsContainer>
      {supportsExpressions && (
        <OptionButton
          icon="arrow_left_to_line"
          primaryColor={primaryColor}
          reverseIconDirection={reverseIconDirection}
          onClick={handleClickOnStartingFrom}
        >
          {t`Starting from...`}
        </OptionButton>
      )}
      <OptionButton
        selected={includeCurrent}
        primaryColor={primaryColor}
        icon={includeCurrent ? "check" : "calendar"}
        onClick={handleClickOnIncludeCurrentTimeUnit}
      >
        {/*currentString is already translated*/}
        {currentString}
      </OptionButton>
    </OptionsContainer>
  );
};

const RelativeDatePicker = (props: RelativeDatePickerProps) => {
  const {
    filter,
    onFilterChange,
    formatter = value => value,
    offsetFormatter = value => value,
    className,
    primaryColor,
  } = props;

  const startingFrom = getStartingFrom(filter);
  const [intervals = 30, unit = "day"] = getRelativeDatetimeInterval(filter);

  const showOptions = !startingFrom;
  const numColumns = showOptions ? 3 : 4;

  const [optionsVisible, setOptionsVisible] = useState(false);

  const optionsContent = (
    <OptionsContent {...props} setOptionsVisible={setOptionsVisible} />
  );

  const handleChangeDateNumericInput = (newIntervals: number) => {
    const isValid = isValidTimeInterval(newIntervals, unit);
    const valueToUse = isValid ? newIntervals : Math.abs(intervals);

    onFilterChange(setRelativeDatetimeValue(filter, formatter(valueToUse)));
  };

  const handleChangeUnitInput = (newUnit: DurationInputArg2) => {
    const isValid = isValidTimeInterval(intervals, newUnit);
    const unitToUse = isValid ? newUnit : unit;

    onFilterChange(setRelativeDatetimeUnit(filter, unitToUse));
  };

  return (
    <GridContainer
      className={className}
      numColumns={numColumns}
      data-testid="relative-date-picker"
    >
      {startingFrom ? (
        <GridText>{intervals < 0 ? t`Past` : t`Next`}</GridText>
      ) : null}
      <NumericInput
        className="text-right"
        primaryColor={primaryColor}
        style={SELECT_STYLE}
        data-ui-tag="relative-date-input"
        aria-label={t`Interval`}
        data-testid="relative-datetime-value"
        value={typeof intervals === "number" ? Math.abs(intervals) : intervals}
        onChange={handleChangeDateNumericInput}
        placeholder="30"
      />
      <DateUnitSelector
        value={unit}
        primaryColor={primaryColor}
        onChange={newUnit =>
          handleChangeUnitInput(newUnit as DurationInputArg2)
        }
        aria-label={t`Unit`}
        testId="relative-datetime-unit"
        intervals={intervals}
        formatter={formatter}
        periods={ALL_PERIODS}
      />
      {showOptions ? (
        <TippyPopover
          visible={optionsVisible}
          placement="bottom-start"
          content={optionsContent}
          onClose={() => setOptionsVisible(false)}
        >
          <MoreButton
            icon="ellipsis"
            aria-label={t`Options`}
            primaryColor={primaryColor}
            onClick={() => setOptionsVisible(!optionsVisible)}
          />
        </TippyPopover>
      ) : (
        <div />
      )}
      {startingFrom ? (
        <>
          <GridText>{t`Starting from`}</GridText>
          <NumericInput
            className="text-right"
            primaryColor={primaryColor}
            style={SELECT_STYLE}
            aria-label={t`Starting from interval`}
            data-ui-tag="relative-date-input"
            data-testid="starting-from-value"
            value={
              typeof startingFrom[0] === "number"
                ? Math.abs(startingFrom[0])
                : startingFrom[0]
            }
            onChange={(value: number) =>
              onFilterChange(
                setStartingFrom(
                  filter,
                  offsetFormatter(value),
                  startingFrom[1],
                ),
              )
            }
            placeholder="30"
          />
          <DateUnitSelector
            value={startingFrom[1]}
            primaryColor={primaryColor}
            onChange={value => {
              onFilterChange(setStartingFrom(filter, startingFrom[0], value));
            }}
            formatDisplayName={(period, intervals) =>
              formatStartingFrom(period, intervals)
            }
            intervals={Math.abs(startingFrom[0])}
            formatter={formatter}
            periods={getStartingFromUnits(unit, startingFrom[1])}
            aria-label={t`Starting from unit`}
            testId="starting-from-unit"
          />
          <MoreButton
            icon="close"
            primaryColor={primaryColor}
            aria-label={t`Remove offset`}
            onClick={() => {
              onFilterChange(toTimeInterval(filter));
            }}
          />
        </>
      ) : null}
    </GridContainer>
  );
};

export const PastPicker = (props: RelativeDatePickerProps) => (
  <RelativeDatePicker {...props} formatter={value => value * -1} />
);

export const NextPicker = (props: RelativeDatePickerProps) => (
  <RelativeDatePicker
    {...props}
    offsetFormatter={value => value * -1}
    reverseIconDirection
  />
);
