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
  labelEllipsis?: boolean;
}
