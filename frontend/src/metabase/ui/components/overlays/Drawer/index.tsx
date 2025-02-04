import {
  Drawer as MantineDrawer,
  type DrawerProps as MantineDrawerProps,
} from "@mantine/core";

import { PreventEagerPortal } from "metabase/ui";
export { getDrawerOverrides } from "./Drawer.styled";

export type { DrawerProps } from "@mantine/core";

export const Drawer = function Drawer(props: MantineDrawerProps) {
  return (
    <PreventEagerPortal {...props}>
      <MantineDrawer {...props} />
    </PreventEagerPortal>
  );
};

Drawer.Root = MantineDrawer.Root;
Drawer.CloseButton = MantineDrawer.CloseButton;
Drawer.Overlay = MantineDrawer.Overlay;
Drawer.Content = MantineDrawer.Content;
Drawer.Header = MantineDrawer.Header;
Drawer.Title = MantineDrawer.Title;
Drawer.Body = MantineDrawer.Body;
Drawer.NativeScrollArea = MantineDrawer.NativeScrollArea;
