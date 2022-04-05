import { ChangeEvent, FocusEvent, HTMLAttributes, ReactNode } from "react";

export interface CheckBoxInputProps {
  size: number;
}

export interface CheckBoxContainerProps {
  disabled?: boolean;
}

export interface CheckBoxIconProps {
  checked?: boolean;
  uncheckedColor: string;
}

export interface CheckBoxIconContainerProps {
  checked?: boolean;
  size: number;
  checkedColor: string;
  uncheckedColor: string;
}

export interface CheckBoxLabelProps {
  labelEllipsis: boolean;
}

export interface CheckBoxProps
  extends CheckBoxContainerProps,
    CheckBoxInputProps,
    CheckBoxIconContainerProps,
    CheckBoxIconProps,
    CheckBoxLabelProps,
    Omit<HTMLAttributes<HTMLElement>, "onChange" | "onFocus" | "onBlur"> {
  label?: ReactNode;
  indeterminate?: boolean;
  autoFocus?: boolean;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
}

export interface CheckboxTooltipProps {
  condition: boolean;
  label: ReactNode;
  children: ReactNode;
}
