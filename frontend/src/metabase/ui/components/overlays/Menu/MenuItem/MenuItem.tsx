import type { MenuItemProps, PolymorphicComponentProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import { type MouseEvent, type TouchEvent, forwardRef } from "react";

// hack to prevent parent Popover from closing when selecting a Menu.Item
// check useClickOutside hook in mantine
// eslint-disable-next-line react/display-name
export const MenuItem = forwardRef(
  <C = "button",>(
    props: PolymorphicComponentProps<C, MenuItemProps>,
    ref: React.Ref<HTMLButtonElement>,
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
        ref={ref}
        onMouseDownCapture={handleMouseDownCapture}
        onTouchStartCapture={handleTouchStartCapture}
      />
    );
  },
);
