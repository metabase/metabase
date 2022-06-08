import React, {
  ChangeEvent,
  InputHTMLAttributes,
  useCallback,
  useMemo,
  useState,
  useEffect,
} from "react";
import _ from "underscore";

import {
  SliderContainer,
  SliderInput,
  SliderTooltip,
  SliderTrack,
  ActiveTrack,
} from "./Slider.styled";

export type NumericInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "size" | "onChange"
>;

export interface SliderProps extends NumericInputAttributes {
  value: (number | undefined)[];
  onChange: (value: (number | undefined)[]) => void;
  min?: number;
  max?: number;
  step?: number;
}

const Slider = ({
  value: parentValue,
  onChange,
  min: parentMin = 0,
  max: parentMax = 100,
  step = 1,
}: SliderProps) => {
  const [isHovering, setIsHovering] = useState(false);
  const [value, setValue] = useState([
    parentValue[0] ?? parentMin,
    parentValue[1] ?? parentMax,
  ]);

  // potentially expand the input range to include out-of-range values
  const [min, max] = useMemo(() => {
    return [_.min([...value, parentMin]), _.max([...value, parentMax])];
  }, [value, parentMin, parentMax]);

  useEffect(() => {
    setValue([parentValue[0] ?? min, parentValue[1] ?? max]);
  }, [parentValue, min, max]);

  const [beforeRange, rangeWidth] = useMemo(() => {
    const totalRange = max - min;
    return [
      ((Math.min(...value) - min) / totalRange) * 100,
      (Math.abs(value[1] - value[0]) / totalRange) * 100,
    ];
  }, [value, min, max]);

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>, valueIndex: number) => {
      const changedValue = [...value];
      changedValue[valueIndex] = Number(event.target.value);
      setValue(changedValue);
    },
    [value, setValue],
  );

  const handleChange = useCallback(() => {
    const sortedValues = value[1] < value[0] ? [...value].sort() : value;
    onChange(sortedValues);
  }, [value, onChange]);

  const [minValue, maxValue] = useMemo(
    () =>
      value.every(n => !isNaN(n))
        ? [Math.min(...value), Math.max(...value)]
        : value,
    [value],
  );

  return (
    <SliderContainer
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <SliderTrack />
      <ActiveTrack
        style={{ left: `${beforeRange}%`, width: `${rangeWidth}%` }}
      />
      <SliderTooltip
        data-testid="min-slider-tooltip"
        style={{
          left: getTooltipPosition(beforeRange),
          opacity: isHovering ? 1 : 0,
        }}
      >
        {hasDecimal(step) ? minValue.toFixed(2) : minValue}
      </SliderTooltip>
      <SliderInput
        type="range"
        aria-label="min"
        value={value[0]}
        onChange={e => handleInput(e, 0)}
        onMouseUp={handleChange}
        onKeyUp={handleChange}
        min={min}
        max={max}
        step={step}
      />
      <SliderTooltip
        data-testid="max-slider-tooltip"
        style={{
          left: getTooltipPosition(beforeRange + rangeWidth),
          opacity: isHovering ? 1 : 0,
        }}
      >
        {hasDecimal(step) ? maxValue.toFixed(2) : maxValue}
      </SliderTooltip>
      <SliderInput
        type="range"
        aria-label="max"
        value={value[1]}
        onChange={e => handleInput(e, 1)}
        onMouseUp={handleChange}
        onKeyUp={handleChange}
        min={min}
        max={max}
        step={step}
      />
    </SliderContainer>
  );
};

const getTooltipPosition = (basePosition: number) =>
  `calc(${basePosition}% + ${11 - basePosition * 0.18}px)`;

const hasDecimal = (value: number) => !isNaN(value) && value % 1 !== 0;

export default Slider;
