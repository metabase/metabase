import { ChangeEvent, FocusEvent, HTMLAttributes, ReactNode } from "react";

export interface CheckBoxInputProps {
  size: number;
}

export interface CheckBoxContainerProps {
  disabled: boolean | undefined;
}

export interface CheckBoxIconProps {
  checked: boolean;
  uncheckedColor: string;
}

export interface CheckBoxIconContainerProps {
  checked: boolean | undefined;
  size: number;
  checkedColor: string;
  uncheckedColor: string;
}

export interface CheckBoxLabelProps {
  labelEllipsis: boolean;
}

export interface CheckBoxProps
  extends Omit<HTMLAttributes<HTMLElement>, "onChange" | "onFocus" | "onBlur"> {
  name?: string;
  label?: ReactNode;
  labelEllipsis?: boolean;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  size?: number;
  checkedColor?: string;
  uncheckedColor?: string;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export interface CheckboxTooltipProps {
  hasTooltip: boolean;
  tooltipLabel: ReactNode;
  children: ReactNode;
}
