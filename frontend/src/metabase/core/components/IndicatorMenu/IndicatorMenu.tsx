import { type PropsWithChildren, useContext } from "react";

import { Menu, type MenuProps } from "metabase/ui";

import {
  IndicatorMenuContext,
  IndicatorMenuProvider,
} from "./IndicatorMenuContext";
import { IndicatorMenuItem } from "./IndicatorMenuItem";
import { IndicatorMenuTarget } from "./IndicatorMenuTarget";

const _IndicatorMenu = (props: PropsWithChildren<MenuProps>) => {
  const ctx = useContext(IndicatorMenuContext);

  if (!ctx) {
    throw new Error("Indicator Menu Context not found");
  }

  const handleOpen = () => {
    props.onOpen?.();
    ctx.handleOpen();
  };

  return <Menu {...props} keepMounted onOpen={handleOpen}></Menu>;
};

export const IndicatorMenu = ({
  menuKey,
  ...rest
}: PropsWithChildren<MenuProps & { menuKey: string }>) => (
  <IndicatorMenuProvider menuKey={menuKey}>
    <_IndicatorMenu {...rest}></_IndicatorMenu>
  </IndicatorMenuProvider>
);

IndicatorMenu.Divider = Menu.Divider;
IndicatorMenu.Item = Menu.Item;
IndicatorMenu.Dropdown = Menu.Dropdown;
IndicatorMenu.ItemWithBadge = IndicatorMenuItem;
IndicatorMenu.Target = IndicatorMenuTarget;
