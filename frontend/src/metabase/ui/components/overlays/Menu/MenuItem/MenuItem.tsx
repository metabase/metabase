import type { MenuItemProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import type { PolymorphicComponentProps } from "@mantine/utils";
import type { MouseEvent, TouchEvent } from "react";

// hack to prevent parent Popover from closing when selecting a Menu.Item
// check useClickOutside hook in mantine
export const MenuItem = <C = "button",>(
  props: PolymorphicComponentProps<C, MenuItemProps>,
) => {
  const typeCastedProps = props as MenuItemProps;

  const handleMouseDownCapture = (event: MouseEvent) => {
    event.nativeEvent.stopImmediatePropagation();
  };
  const handleTouchStartCapture = (event: TouchEvent) => {
    event.nativeEvent.stopImmediatePropagation();
  };

  return (
    <Menu.Item
      {...typeCastedProps}
      onMouseDownCapture={handleMouseDownCapture}
      onTouchStartCapture={handleTouchStartCapture}
    />
  );
};
