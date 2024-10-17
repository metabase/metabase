import { type BoxProps, Group, type MantineSize, Text } from "@mantine/core";
import cx from "classnames";
import { useEffect } from "react";
import { type HTMLAttributes, type Ref, forwardRef } from "react";

import useSequencedContentCloseHandler from "metabase/hooks/use-sequenced-content-close-handler";
import { Icon, type IconName } from "metabase/ui";

import S from "./SelectItem.module.css";
import { getItemFontSize, getItemLineHeight } from "./utils";

export interface SelectItemProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "style">,
    BoxProps {
  value: string;
  label?: string;
  size?: MantineSize;
  icon?: IconName;
  selected?: boolean;
  disabled?: boolean;
}

export const SelectItem = forwardRef(function SelectItem(
  {
    className,
    value,
    label = value,
    size = "md",
    icon,
    selected,
    disabled,
    ...props
  }: SelectItemProps,
  ref: Ref<HTMLDivElement>,
) {
  // FIXME: since we lost control over the dropdown component this is the only place we can
  // use this hook which is terrible. We need to build a custom dropdown instead
  const { setupCloseHandler, removeCloseHandler } =
    useSequencedContentCloseHandler();

  useEffect(() => {
    setupCloseHandler(document.body, () => undefined);
    return () => removeCloseHandler();
  }, [setupCloseHandler, removeCloseHandler]);

  return (
    <Group
      ref={ref}
      className={cx(S.item, className)}
      fz={getItemFontSize(size)}
      lh={getItemLineHeight(size)}
      p="sm"
      gap="sm"
      flex={1}
      role="option"
      aria-selected={selected}
      {...props}
    >
      {icon && <Icon name={icon} />}
      <Text c="inherit" lh="inherit">
        {label}
      </Text>
    </Group>
  );
});
