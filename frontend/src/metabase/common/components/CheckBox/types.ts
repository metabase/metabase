import type { ColorName } from "metabase/lib/colors/types";

export interface CheckBoxInputProps {
  size: number;
}

export interface CheckBoxContainerProps {
  disabled: boolean | undefined;
}

export interface CheckBoxIconProps {
  checked: boolean;
  uncheckedColor: ColorName;
}

export interface CheckBoxIconContainerProps {
  checked: boolean | undefined;
  size: number;
  checkedColor: ColorName;
  uncheckedColor: ColorName;
}

export interface CheckBoxLabelProps {
  labelEllipsis?: boolean;
}
