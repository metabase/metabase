import cx from "classnames";

import CS from "metabase/css/core/index.css";
import { Select } from "metabase/ui";
import * as Lib from "metabase-lib";

const defaultDisplayName = (period: string, intervals: number) =>
  Lib.describeTemporalUnit(period, intervals).toLowerCase();

type Props = {
  className?: string;
  value: number | string;
  onChange: (value: number | string) => void;
  intervals: number | string;
  formatter: (value: any) => any;
  formatDisplayName?: (period: string, intervals: number) => string;
  periods: string[];
  "aria-label"?: string;
  testId?: string;
};

const DateUnitSelector = ({
  className,
  value,
  onChange,
  intervals,
  formatter,
  formatDisplayName = defaultDisplayName,
  periods,
  "aria-label": ariaLabel,
  testId,
}: Props) => (
  <Select
    className={cx(className)}
    value={value ? String(value) : null}
    onChange={value => value && onChange(value)}
    data={periods.map(period => ({
      value: period,
      label: formatDisplayName(period, formatter(intervals) || 1),
    }))}
    w="150px"
    data-testid={testId}
    aria-label={ariaLabel}
    radius="md"
    classNames={{
      input: CS.textBold,
      dropdown: CS.textBold,
    }}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateUnitSelector;
