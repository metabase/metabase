import React, { AnchorHTMLAttributes } from "react";
import { ToggleRoot } from "./Toggle.styled";

export interface ToggleProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "onChange"> {
  className?: string;
  value: boolean;
  small?: boolean;
  color?: string;
  onChange?: (value: boolean) => void;
}

const Toggle = ({
  className,
  value,
  small,
  color,
  onChange,
  ...rest
}: ToggleProps): JSX.Element => {
  const handleClick = () => {
    onChange && onChange(!value);
  };

  return (
    <ToggleRoot
      {...rest}
      className={className}
      role="checkbox"
      aria-checked={value}
      isSmall={small}
      isSelected={value}
      currentColor={color}
      onClick={handleClick}
    />
  );
};

export default Toggle;
