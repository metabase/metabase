import React, {
  ChangeEvent,
  InputHTMLAttributes,
  forwardRef,
  useCallback,
} from "react";
import { ToggleRoot } from "./Toggle.styled";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  className?: string;
  value: boolean;
  small?: boolean;
  color?: string;
  onChange?: (value: boolean) => void;
}

const Toggle = forwardRef(
  (
    { className, value, small, color, onChange, ...rest }: ToggleProps,
    ref: any,
  ): JSX.Element => {
    const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
      onChange && onChange(event.currentTarget.checked);
    }, []);

    return (
      <ToggleRoot
        {...rest}
        innerRef={ref}
        className={className}
        type="checkbox"
        checked={value}
        small={small}
        currentColor={color}
        onChange={handleChange}
      />
    );
  },
);

export default Toggle;
