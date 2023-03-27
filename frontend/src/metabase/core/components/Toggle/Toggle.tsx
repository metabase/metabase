import React, {
  ChangeEvent,
  InputHTMLAttributes,
  forwardRef,
  useCallback,
  Ref,
} from "react";
import { ToggleLabel, ToggleRoot, ToggleWithLabelRoot } from "./Toggle.styled";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  className?: string;
  value?: boolean;
  small?: boolean;
  color?: string;
  onChange?: (value: boolean) => void;
  label?: string;
}

const Toggle = forwardRef(function Toggle(
  { className, value, small, color, onChange, label, ...rest }: ToggleProps,
  ref: Ref<HTMLInputElement>,
): JSX.Element {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange && onChange(event.currentTarget.checked);
    },
    [onChange],
  );

  if (label) {
    return (
      <ToggleWithLabelRoot>
        <ToggleLabel>{label}</ToggleLabel>
        <ToggleRoot
          {...rest}
          ref={ref}
          className={className}
          type="checkbox"
          role="switch"
          checked={value}
          aria-checked={value}
          small={small}
          currentColor={color}
          onChange={handleChange}
        />
      </ToggleWithLabelRoot>
    );
  }

  return (
    <ToggleRoot
      {...rest}
      ref={ref}
      className={className}
      type="checkbox"
      role="switch"
      checked={value}
      aria-checked={value}
      small={small}
      currentColor={color}
      onChange={handleChange}
    />
  );
});

export default Toggle;
