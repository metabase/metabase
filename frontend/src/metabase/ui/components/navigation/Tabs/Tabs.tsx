import {
  Tabs as MantineTabs,
  type TabsProps as MantineTabsProps,
} from "@mantine/core";

import { TabsTab } from "./TabsTab";

export type TabsSize = "sm" | "md";

const DEFAULT_SIZE: TabsSize = "md";

/**
 * `sm` exists only for the `pills` variant; the underlined default variant
 * comes in a single size.
 */
type TabsVariantProps =
  | { variant: "pills"; size?: TabsSize }
  | {
      variant?: Exclude<MantineTabsProps["variant"], "pills">;
      size?: typeof DEFAULT_SIZE;
    };

export type TabsProps<T extends string = string> = Omit<
  MantineTabsProps,
  "value" | "defaultValue" | "onChange" | "variant"
> &
  TabsVariantProps & {
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
  };

function TabsRoot<T extends string = string>({
  listBorder = true,
  variant,
  size = DEFAULT_SIZE,
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
      data-size={size}
      data-list-border-hidden={hideListBorder || undefined}
    />
  );
}

export const Tabs = Object.assign(TabsRoot, {
  List: MantineTabs.List,
  Tab: TabsTab,
  Panel: MantineTabs.Panel,
});
