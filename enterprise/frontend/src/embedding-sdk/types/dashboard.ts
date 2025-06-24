import type { MantineColor } from "@mantine/core/lib/core";
import type { ReactNode } from "react";

import type { MetabaseCollection } from "embedding-sdk/types/collection";

import type { SdkEntityId } from "./entity-id";
import type { IconName } from "./ui";

export type SdkDashboardId = number | string | SdkEntityId;

/**
 * The Dashboard entity
 */
export type MetabaseDashboard = {
  id: SdkDashboardId;
  entity_id: SdkEntityId;
  created_at: string;
  updated_at: string;
  collection?: MetabaseCollection | null;
  name: string;
  description: string | null;
  "last-edit-info": {
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    timestamp: string;
  };
};

export type DashboardEventHandlersProps = {
  /**
   * Callback that is called when the dashboard is loaded.
   */
  onLoad?: (dashboard: MetabaseDashboard | null) => void;

  /**
   * Callback that is called when the dashboard is loaded without cards.
   */
  onLoadWithoutCards?: (dashboard: MetabaseDashboard | null) => void;
};

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
