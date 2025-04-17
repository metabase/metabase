import type { MantineColor } from "@mantine/core/lib/core";
import type { ReactNode } from "react";

import type { DashboardId } from "metabase-types/api";

import type { SdkEntityId } from "./entity-id";
import type { IconName } from "./ui";

export type SdkDashboardId = DashboardId | SdkEntityId;

export type DashCardMenuItem = {
  /**
   * Icon name
   */
  iconName: IconName;

  /**
   * Item label
   **/
  label: string;

  /**
   * Item children
   */
  children?: ReactNode;

  /**
   * Key of `theme.colors` or any valid CSS color
   **/
  color?: MantineColor;

  /**
   * Determines whether the menu should be closed when the item is clicked, overrides `closeOnItemClick` prop on the `Menu` component
   **/
  closeMenuOnClick?: boolean;

  /**
   * Section displayed on the left side of the label
   **/
  leftSection?: ReactNode;

  /**
   * Section displayed on the right side of the label
   **/
  rightSection?: ReactNode;

  /**
   * Disables item
   **/
  disabled?: boolean;

  /**
   * Click handler
   */
  onClick: () => void;
};
