import type { MenuItemProps, PolymorphicComponentProps } from "@mantine/core";
import { Menu } from "@mantine/core";
import clsx from "clsx";
import {
  type MouseEvent,
  type MouseEventHandler,
  type Ref,
  type TouchEvent,
  forwardRef,
} from "react";

import Styles from "../Menu.module.css";

type WithOnClick = MenuItemProps & {
  onClick?: MouseEventHandler<HTMLElement>;
};

// eslint-disable-next-line react/display-name
export const MenuItem = forwardRef(
  <C = "button",>(
    rawProps: PolymorphicComponentProps<C, MenuItemProps> & {
      /** Looks disabled, but keeps rightSection interactive */
      softDisabled?: boolean;
    },
    ref: Ref<HTMLButtonElement>,
  ) => {
    // existing hack: do not close parent popover
    const onMouseDownCapture = (e: MouseEvent) =>
      e.nativeEvent.stopImmediatePropagation();
    const onTouchStartCapture = (e: TouchEvent) =>
      e.nativeEvent.stopImmediatePropagation();

    const {
      softDisabled,
      classNames,
      styles: userStyles,
      onClick: userOnClick,
      ...rest
    } = rawProps as unknown as WithOnClick & {
      softDisabled?: boolean;
    };

    const isInsideRightSection = (target: EventTarget | null) =>
      target instanceof HTMLElement &&
      !!target.closest('[data-position="right"]');

    const onItemClick: MouseEventHandler<HTMLElement> | undefined = (e) => {
      if (softDisabled) {
        if (isInsideRightSection(e.target)) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      userOnClick?.(e);
    };

    return (
      <Menu.Item
        {...(rest as MenuItemProps)}
        ref={ref}
        onMouseDownCapture={onMouseDownCapture}
        onTouchStartCapture={onTouchStartCapture}
        onClick={onItemClick}
        aria-disabled={softDisabled || undefined}
        classNames={{
          ...classNames,
          item: clsx(classNames?.item, softDisabled && Styles.itemSoftDisabled),
          itemLabel: clsx(
            classNames?.itemLabel,
            softDisabled && Styles.itemLabelSoftDisabled,
          ),
          itemSection: clsx(
            classNames?.itemSection,
            softDisabled && Styles.itemSectionLeftSoftDisabled,
          ),
        }}
        styles={userStyles}
      />
    );
  },
);
