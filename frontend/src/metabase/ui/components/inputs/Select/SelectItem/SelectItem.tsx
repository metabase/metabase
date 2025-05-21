import { type BoxProps, Group, type MantineSize } from "@mantine/core";
import cx from "classnames";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

import SS from "../Select.module.css";

import S from "./SelectItem.module.css";
import { getItemFontSize, getItemLineHeight } from "./utils";

export interface SelectItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style">,
    BoxProps {
  disabled?: boolean;
  size?: MantineSize;
  selected?: boolean;
}

export const SelectItem = forwardRef(function SelectItem(
  {
    className,
    disabled, // intentionally excluded from props spreading
    size = "md",
    selected,
    ...props
  }: SelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  return (
    <Group
      ref={ref}
      className={cx(S.item, SS.SelectItems_Item, className)}
      fz={getItemFontSize(size)}
      lh={getItemLineHeight(size)}
      p="sm"
      gap="sm"
      flex={1}
      aria-selected={selected}
      {...props}
    />
  );
});
