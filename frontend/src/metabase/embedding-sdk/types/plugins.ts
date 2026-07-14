/* eslint-disable-next-line no-restricted-imports */
import type { MantineColor } from "@mantine/core";
import type { ReactNode } from "react";

import type { ClickAction } from "metabase/visualizations/types";

import type { IconName } from "./icon";
import type { MetabaseQuestion } from "./question";

export type MetabaseDataPointObject = {
  value?: string | number | null | boolean | object;
  column?: {
    name?: string;
    display_name?: string;
  };
  data?: Record<string, string | number | null | boolean | object>;
  event?: MouseEvent;
  question?: MetabaseQuestion;
  raw?: {
    value?: string | number | null | boolean;
    column?: Record<string, any>;
    event?: MouseEvent;
    data?: {
      col: Record<string, any> | null;
      value: string | number | null | boolean;
    }[];
  };
};

export type MetabaseClickActionPluginsConfig = (
  clickActions: ClickAction[],
  clickedDataPoint: MetabaseDataPointObject,
) => ClickAction[] | { onClick: () => void };

export type DashboardCardMenuCustomElement = ({
  question,
}: {
  question: MetabaseQuestion;
}) => ReactNode;

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

export type CustomDashboardCardMenuItem = ({
  question,
}: {
  question?: MetabaseQuestion;
}) => DashCardMenuItem;

export type DashboardCardCustomMenuItem = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  customItems?: (DashCardMenuItem | CustomDashboardCardMenuItem)[];
};

export type MetabaseDashboardPluginsConfig = {
  dashboardCardMenu?:
    | DashboardCardMenuCustomElement
    | DashboardCardCustomMenuItem;
};

export type MetabasePluginsConfig = {
  mapQuestionClickActions?: MetabaseClickActionPluginsConfig;
  dashboard?: MetabaseDashboardPluginsConfig;
};
