import {
  type DrawerCssVariables,
  type DrawerFactory,
  type DrawerProps,
  type DrawerRootProps,
  type DrawerStylesNames,
  type Factory,
  Drawer as MantineDrawer,
  factory,
  useDrawerStackContext,
} from "@mantine/core";
import { type Ref, useContext } from "react";

import { OverlayStackContext, useGatedCloseProps } from "../overlay-stack";

function StackedDrawer({
  ref,
  ...props
}: DrawerProps & { ref: Ref<HTMLDivElement> }) {
  const stack = useDrawerStackContext();
  // Mantine keeps inactive Drawer.Stack members open but hidden.
  const isMantineStackItem = stack && props.stackId;
  const closeProps = useGatedCloseProps({
    ...props,
    opened:
      props.opened &&
      (!isMantineStackItem || stack.currentId === props.stackId),
  });
  return <MantineDrawer {...props} {...closeProps} ref={ref} />;
}

type DrawerRootFactory = Factory<{
  props: DrawerRootProps;
  ref: HTMLDivElement;
  stylesNames: DrawerStylesNames;
  vars: DrawerCssVariables;
  compound: true;
}>;

function StackedDrawerRoot({
  ref,
  ...props
}: DrawerRootProps & { ref: Ref<HTMLDivElement> }) {
  const closeProps = useGatedCloseProps(props);
  return <MantineDrawer.Root {...props} {...closeProps} ref={ref} />;
}

const DrawerRoot = factory<DrawerRootFactory>((props, ref) => {
  const overlayStack = useContext(OverlayStackContext);
  return overlayStack ? (
    <StackedDrawerRoot {...props} ref={ref} />
  ) : (
    <MantineDrawer.Root {...props} ref={ref} />
  );
});
DrawerRoot.classes = MantineDrawer.Root.classes;
DrawerRoot.displayName = MantineDrawer.Root.displayName;

export const Drawer = factory<DrawerFactory>((props, ref) => {
  const overlayStack = useContext(OverlayStackContext);
  return overlayStack ? (
    <StackedDrawer {...props} ref={ref} />
  ) : (
    <MantineDrawer {...props} ref={ref} />
  );
});
Drawer.classes = MantineDrawer.classes;
Drawer.displayName = MantineDrawer.displayName;
Drawer.Root = DrawerRoot;
Drawer.Overlay = MantineDrawer.Overlay;
Drawer.Content = MantineDrawer.Content;
Drawer.Body = MantineDrawer.Body;
Drawer.Header = MantineDrawer.Header;
Drawer.Title = MantineDrawer.Title;
Drawer.CloseButton = MantineDrawer.CloseButton;
Drawer.Stack = MantineDrawer.Stack;
