import type { ReactNode } from "react";

import type { MetabaseQuestion } from "embedding-sdk-bundle/types";
import type { DashboardContextProps } from "metabase/dashboard/context";
import type { IconName } from "metabase/embedding-sdk/types/icon";
import type { MantineColor } from "metabase/ui";
import type { DashboardCard, Dataset } from "metabase-types/api";

export type DashboardCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
  /** @internal */
  dashcard: DashboardCard;
  /** @internal */
  result: Dataset;
  /** @internal */
  downloadsEnabled: DashboardContextProps["downloadsEnabled"];
}) => ReactNode;

export type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;

export type DashboardCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  /** @expand */
  customItems?: (DashCardMenuItem | CustomDashboardCardMenuItem)[];
};

export type DashboardCardMenu =
  | DashboardCardMenuCustomElement
  | DashboardCardCustomMenuItem;

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
