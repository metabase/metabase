import type { MantineColor } from "@mantine/core/lib/core";
import type { PropsWithChildren, ReactNode } from "react";

import type { IconName } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { Dashboard, DashboardCard, Series } from "metabase-types/api";

export type DashCardMenuItem = PropsWithChildren<{
  /**
   * Icon name
   */
  iconName: IconName;

  /**
   * Item label
   **/
  label: string;

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
}>;

export type DashboardCardMenuProps = {
  question: Question | null;
  dashboard: Dashboard | null;
  dashcard: DashboardCard;
  series: Series;
};

export type DashboardCardMenuCustomElement = (
  props: DashboardCardMenuProps,
) => ReactNode;

export type CustomDashboardCardMenuItem = (
  props: DashboardCardMenuProps,
) => DashCardMenuItem;

export type DashcardMenuItems =
  | "edit-visualization"
  | "edit-link"
  | "download"
  | "metabot"
  | "view-underlying-question";

export type DashboardCardCustomMenuItem = Partial<
  Record<
    DashcardMenuItems,
    boolean | ((props: DashboardCardMenuProps) => boolean)
  > & {
    customItems?: (DashCardMenuItem | CustomDashboardCardMenuItem)[];
  }
>;
