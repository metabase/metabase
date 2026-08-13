import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from "@mantine/core";

export interface TabsProps<T extends string = string> extends Omit<
  MantineTabsProps,
  "value" | "defaultValue" | "onChange"
> {
  value?: T | null;
  defaultValue?: T | null;
  // Need to keep 'null' option here, because Tabs has `allowTabDeactivation`
  // prop which leads to null value being passed to onChange.
  onChange?: (value: T | null) => void;
  /**
   * Whether the tab list renders its own divider line. Only applies to the
   * default (underlined) variant; ignored for `pills`, `outline`, etc.
   */
  listBorder?: boolean;
}

function TabsRoot<T extends string = string>({
  listBorder = true,
  variant,
  onChange,
  ...props
}: TabsProps<T>) {
  const isUnderlinedVariant = variant == null || variant === "default";
  const hideListBorder = isUnderlinedVariant && !listBorder;

  return (
    <MantineTabs
      {...props}
      variant={variant}
      // Mantine types the change value as `string | null` because it cannot see
      // the `Tabs.Tab` values. But we know that the emitted value is always one of those,
      // so we can safely cast it to the expected type.
      onChange={onChange as MantineTabsProps["onChange"]}
      data-list-border-hidden={hideListBorder || undefined}
    />
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: MantineTabs.List,
  Tab: MantineTabs.Tab,
  Panel: MantineTabs.Panel,
});
