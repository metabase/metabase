import type { ChangeEvent, InputHTMLAttributes } from "react";
import { useCallback, useMemo, useState, useEffect } from "react";
import _ from "underscore";

import {
  SliderContainer,
  SliderInput,
  SliderTooltip,
  SliderTrack,
  ActiveTrack,
  TooltipContainer,
  THUMB_SIZE,
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

  // we continuously track the component's internal value,
  // but only update the parent value via onChange when the user has finished dragging
  const [value, setValue] = useState([
    parentValue[0] ?? parentMin,
    parentValue[1] ?? parentMax,
  ]);

  // potentially expand the input range to include out-of-range values
  const [min, max] = useMemo(() => {
    return [_.min([...value, parentMin]), _.max([...value, parentMax])];
  }, [value, parentMin, parentMax]);

  // if we get a new parent value, update our internal value
  useEffect(() => {
    setValue([parentValue[0] ?? min, parentValue[1] ?? max]);
  }, [parentValue, min, max]);

  // calculate min and max separately from current values to display the correct tooltips
  const [minValue, maxValue] = useMemo(
    () =>
      value.every(n => !isNaN(n))
        ? [Math.min(...value), Math.max(...value)]
        : value,
    [value],
  );

  // calculate width percentages for the track and tooltip
  const [beforeRange, rangeWidth] = useMemo(() => {
    const totalRange = max - min;
    return [
      ((minValue - min) / totalRange) * 100,
      ((maxValue - minValue) / totalRange) * 100,
    ];
  }, [minValue, maxValue, min, max]);

  const handleInput = useCallback(
    (event: ChangeEvent<HTMLInputElement>, valueIndex: number) => {
      const changedValue = [...value];
      changedValue[valueIndex] = Number(event.target.value);
      setValue(changedValue);
    },
    [value, setValue],
  );

  const handleChange = useCallback(() => {
    onChange([minValue, maxValue]);
  }, [minValue, maxValue, onChange]);

  return (
    <SliderContainer
      onMouseEnter={() => setIsHovering(true)}
      onTouchStart={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onTouchEnd={() => setIsHovering(false)}
    >
      <SliderTrack />
      <TooltipContainer>
        <ActiveTrack
          style={{
            left: getTooltipPosition(beforeRange),
            width: `${rangeWidth}%`,
          }}
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
        <SliderTooltip
          data-testid="max-slider-tooltip"
          style={{
            left: getTooltipPosition(beforeRange + rangeWidth),
            opacity: isHovering ? 1 : 0,
          }}
        >
          {hasDecimal(step) ? maxValue.toFixed(2) : maxValue}
        </SliderTooltip>
      </TooltipContainer>
      <SliderInput
        type="range"
        aria-label="min"
        value={value[0]}
        onChange={e => handleInput(e, 0)}
        onMouseUp={handleChange}
        onTouchEnd={handleChange}
        onKeyUp={handleChange}
        min={min}
        max={max}
        step={step}
      />
      <SliderInput
        type="range"
        aria-label="max"
        value={value[1]}
        onChange={e => handleInput(e, 1)}
        onMouseUp={handleChange}
        onTouchEnd={handleChange}
        onKeyUp={handleChange}
        min={min}
        max={max}
        step={step}
      />
    </SliderContainer>
  );
};

const getTooltipPosition = (basePosition: number) =>
  `calc(${basePosition}% + (${THUMB_SIZE} / 2) + 2px)`;

const hasDecimal = (value: number) => !isNaN(value) && value % 1 !== 0;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Slider;
