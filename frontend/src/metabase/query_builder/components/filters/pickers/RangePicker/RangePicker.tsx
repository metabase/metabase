import React, {
  useCallback,
  useMemo,
  ChangeEvent,
  useState,
  useEffect,
} from "react";
import _ from "underscore";
import { t } from "ttag";

import Filter from "metabase-lib/lib/queries/structured/Filter";
import Field from "metabase-lib/lib/metadata/Field";
import Slider from "metabase/core/components/Slider";
import { NumberFilterOperator } from "./types";

import { RangeContainer, RangeNumberInput } from "./RangePicker.styled";
import { getStep, roundToStep } from "./utils";

const DEFAULT_MIN = 0;
const DEFAULT_MAX = 100;
const DEFAULT_STEP = 1;
interface RangePickerProps {
  filter: Filter;
  field: Field;
  onFilterChange: (filter: Filter) => void;
  className?: string;
}

function RangePicker({
  filter,
  field,
  onFilterChange,
  className,
}: RangePickerProps) {
  const [fieldMin, fieldMax, step] = useMemo(() => {
    const fingerprint = field.fingerprint?.type?.["type/Number"];
    if (!fingerprint) {
      return [DEFAULT_MIN, DEFAULT_MAX, DEFAULT_STEP];
    }
    const stepCalc = getStep(fingerprint.min, fingerprint.max);
    return [
      roundToStep(fingerprint.min, stepCalc),
      roundToStep(fingerprint.max, stepCalc),
      stepCalc,
    ];
  }, [field]);

  // cache the range of values the user has entered
  const [range, setRange] = useState([
    fieldMin ?? DEFAULT_MIN,
    fieldMax || DEFAULT_MAX,
  ]);

  const values = useMemo(() => getValues(filter), [filter]);

  const updateFilter = useCallback(
    (newValue: (number | undefined)[], manualInput = false) => {
      const [minValue, maxValue] = newValue;
      const [rangeMin, rangeMax] = range;

      // we want to ignore min and max values unless they were manually input
      const emptyMin =
        minValue === undefined || (!manualInput && minValue === rangeMin);
      const emptyMax =
        maxValue === undefined || (!manualInput && maxValue === rangeMax);

      if (emptyMin && emptyMax) {
        onFilterChange(filter.setOperator("=").setArguments([]));
      } else if (emptyMin) {
        onFilterChange(filter.setOperator("<=").setArguments([maxValue]));
      } else if (emptyMax) {
        onFilterChange(filter.setOperator(">=").setArguments([minValue]));
      } else if (minValue === maxValue) {
        onFilterChange(filter.setOperator("=").setArguments([minValue]));
      } else {
        onFilterChange(filter.setOperator("between").setArguments(newValue));
      }
    },
    [filter, onFilterChange, range],
  );

  useEffect(() => {
    const [rangeMin, rangeMax] = range;
    const minValue = _.min(values) ?? DEFAULT_MIN;
    const maxValue = _.max(values) ?? DEFAULT_MAX;

    if (minValue < rangeMin) {
      setRange([minValue, rangeMax]);
    } else if (maxValue > rangeMax) {
      setRange([rangeMin, maxValue]);
    }
  }, [field, values, range]);

  return (
    <>
      <RangeContainer className={className} aria-label={field.displayName()}>
        <RangeInput
          placeholder={t`min`}
          value={values[0] ?? ""}
          onClear={() => updateFilter([undefined, values[1]])}
          onChange={value => updateFilter([value, values[1]], true)}
        />
        <Slider
          min={range[0]}
          max={range[1]}
          step={step}
          value={values}
          onChange={updateFilter}
          showMinMaxTooltips={false}
        />
        <RangeInput
          placeholder={t`max`}
          value={values[1] ?? ""}
          onClear={() => updateFilter([values[0], undefined])}
          onChange={value => updateFilter([values[0], value], true)}
        />
      </RangeContainer>
    </>
  );
}

function getValues(filter: Filter): (number | undefined)[] {
  const operatorName = filter.operatorName() as NumberFilterOperator;
  const args = filter.arguments();

  const valueMap = {
    between: () => args,
    "=": () => [args[0], args[0]],
    "<": () => [undefined, args[0]],
    "<=": () => [undefined, args[0]],
    ">": () => [args[0], undefined],
    ">=": () => [args[0], undefined],
    "!=": () => [undefined, undefined],
  };

  return valueMap[operatorName]?.() || [undefined, undefined];
}

interface RangeInputProps {
  value: number | "";
  onChange: (value: number | undefined) => void;
  onClear: () => void;
  placeholder: string;
}

const RangeInput = ({
  value,
  onChange,
  onClear,
  placeholder,
}: RangeInputProps) => {
  const [inputValue, setInputValue] = useState<string | number>(value);
  useEffect(() => {
    // only update from parent if the new value is not equal to the old
    if (value !== Number(inputValue)) {
      setInputValue(value);
    }
  }, [value, setInputValue]); // eslint-disable-line react-hooks/exhaustive-deps

  // only update the value if the user has entered a valid number
  const handleChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);

      if (e.target.value === "") {
        onChange(undefined);
      } else if (!isNaN(Number(e.target.value))) {
        onChange(Number(e.target.value));
      }
    },
    [onChange],
  );

  return (
    <RangeNumberInput
      size="small"
      rightIcon={value !== "" ? "close" : undefined}
      placeholder={placeholder}
      value={inputValue}
      onChange={handleChange}
      onRightIconClick={onClear}
      rightIconTooltip={t`Clear`}
      fullWidth
    />
  );
};

export default RangePicker;
