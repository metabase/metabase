import type { ReactNode } from "react";

import type { DashboardContextProps } from "metabase/dashboard/context";
import type { MenuItemProps } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { DashboardCard, Dataset, IconName } from "metabase-types/api";

export type DashCardMenuItem = Pick<MenuItemProps, "color" | "rightSection"> & {
  iconName: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  closeMenuOnClick?: boolean;
};

export type DashCardMenuItemGetter = ({
  question,
}: {
  question?: Question;
}) => DashCardMenuItem;

export type DashCardMenuOptions = {
  withDownloads?: boolean;
  withEditLink?: boolean;
  customItems?: (DashCardMenuItem | DashCardMenuItemGetter)[];
};

export type DashCardMenuRenderer = ({
  question,
}: {
  question: Question;
  dashcard: DashboardCard;
  result: Dataset;
  downloadsEnabled: DashboardContextProps["downloadsEnabled"];
}) => ReactNode;

export type DashCardMenuSpec = DashCardMenuRenderer | DashCardMenuOptions;
