import Select, { Option } from "metabase/core/components/Select";
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
    className={className}
    value={value}
    onChange={(e: any) => onChange(e.target.value)}
    width={150}
    compact
    buttonProps={
      ariaLabel || testId
        ? { "aria-label": ariaLabel, "data-testid": testId }
        : undefined
    }
  >
    {periods.map(period => (
      <Option value={period} key={period}>
        {formatDisplayName(period, formatter(intervals) || 1)}
      </Option>
    ))}
  </Select>
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DateUnitSelector;
