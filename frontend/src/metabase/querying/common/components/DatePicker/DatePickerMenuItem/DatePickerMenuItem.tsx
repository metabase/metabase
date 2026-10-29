import type { ButtonHTMLAttributes } from "react";

import { UnstyledButton, type UnstyledButtonProps } from "metabase/ui";

import S from "./DatePickerMenuItem.module.css";

type DatePickerMenuItemProps = UnstyledButtonProps &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    isSelected?: boolean;
  };

export const DatePickerMenuItem = ({
  isSelected,
  ...props
}: DatePickerMenuItemProps) => (
  <UnstyledButton
    className={S.item}
    mod={{ selected: isSelected }}
    {...props}
  />
);
