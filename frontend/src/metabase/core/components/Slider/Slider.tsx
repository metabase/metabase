import React, {
  ChangeEvent,
  InputHTMLAttributes,
  useCallback,
  useMemo,
} from "react";

import {
  SliderContainer,
  SliderInput,
  SliderTrack,
  ActiveTrack,
} from "./Slider.styled";

export type NumericInputAttributes = Omit<
  InputHTMLAttributes<HTMLDivElement>,
  "value" | "size" | "onChange"
>;

export interface SliderProps extends NumericInputAttributes {
  value: number[];
  onChange: (value: number[]) => void;
  min?: number;
  max?: number;
  step?: number;
}

const Slider = ({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: SliderProps) => {
  const [rangeMin, rangeMax] = useMemo(
    () => [Math.min(...value, min, max), Math.max(...value, min, max)],
    [value, min, max],
  );

  const [beforeRange, rangeWidth] = useMemo(() => {
    const totalRange = rangeMax - rangeMin;

    return [
      ((Math.min(...value) - rangeMin) / totalRange) * 100,
      (Math.abs(value[1] - value[0]) / totalRange) * 100,
    ];
  }, [value, rangeMin, rangeMax]);

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>, valueIndex: number) => {
      const changedValue = [...value];
      changedValue[valueIndex] = Number(event.target.value);
      onChange(changedValue);
    },
    [value, onChange],
  );

  const sortValues = useCallback(() => {
    if (value[0] > value[1]) {
      const sortedValues = [...value].sort();
      onChange(sortedValues);
    }
  }, [value, onChange]);

  return (
    <SliderContainer>
      <SliderTrack />
      <ActiveTrack left={beforeRange} width={rangeWidth} />
      <SliderInput
        type="range"
        aria-label="min"
        value={value[0]}
        onChange={e => handleChange(e, 0)}
        onMouseUp={sortValues}
        min={rangeMin}
        max={rangeMax}
        step={step}
      />
      <SliderInput
        type="range"
        aria-label="max"
        value={value[1]}
        onChange={e => handleChange(e, 1)}
        onMouseUp={sortValues}
        min={rangeMin}
        max={rangeMax}
        step={step}
      />
    </SliderContainer>
  );
};

export default Slider;
