import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from "@mantine/core";

export interface TabsProps extends MantineTabsProps {
  /**
   * Whether the tab list renders its own divider line. Only applies to the
   * default (underlined) variant; ignored for `pills`, `outline`, etc.
   */
  listBorder?: boolean;
}

function TabsRoot({ listBorder = true, variant, ...props }: TabsProps) {
  const isUnderlinedVariant = variant == null || variant === "default";
  const hideListBorder = isUnderlinedVariant && !listBorder;

  return (
    <MantineTabs
      {...props}
      variant={variant}
      data-list-border-hidden={hideListBorder || undefined}
    />
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: MantineTabs.List,
  Tab: MantineTabs.Tab,
  Panel: MantineTabs.Panel,
});
