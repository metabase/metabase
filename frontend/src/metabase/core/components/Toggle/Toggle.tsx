import { ChangeEvent, InputHTMLAttributes, forwardRef, useCallback, Ref } from "react";
import { ToggleRoot } from "./Toggle.styled";

export interface ToggleProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  className?: string;
  value?: boolean;
  small?: boolean;
  color?: string;
  onChange?: (value: boolean) => void;
}

const Toggle = forwardRef(function Toggle(
  { className, value, small, color, onChange, ...rest }: ToggleProps,
  ref: Ref<HTMLInputElement>,
): JSX.Element {
  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      onChange && onChange(event.currentTarget.checked);
    },
    [onChange],
  );

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Toggle;
