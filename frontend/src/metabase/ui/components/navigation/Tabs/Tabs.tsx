import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from "@mantine/core";

export interface TabsProps<T extends string = string> extends Omit<
  MantineTabsProps,
  "value" | "defaultValue" | "onChange"
> {
  /** Controlled component value */
  value?: T | null;
  /** Uncontrolled component default value */
  defaultValue?: T | null;
  /** Called when value changes */
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
      // the `Tabs.Tab` values. The emitted value is always one of those, which
      // the caller declares as `T`.
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
