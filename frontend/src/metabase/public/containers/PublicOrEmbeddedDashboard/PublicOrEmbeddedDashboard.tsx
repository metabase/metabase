import type { WithRouterProps } from "react-router";

import { DashboardLocationSync } from "metabase/dashboard/containers/DashboardApp/DashboardLocationSync";
import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import type { EmbeddingAdditionalHashOptions } from "metabase/public/lib/types";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export type PublicOrEmbeddedDashboardProps = Pick<
  DashboardContextProps,
  | "dashboardId"
  | "hasNightModeToggle"
  | "isNightMode"
  | "onNightModeChange"
  | "background"
  | "bordered"
  | "titled"
  | "theme"
  | "hideParameters"
  | "downloadsEnabled"
  | "parameterQueryParams"
  | "onLoad"
  | "onLoadWithoutCards"
  | "cardTitled"
  | "withFooter"
  | "onError"
  | "getClickActionMode"
  | "navigateToNewCardFromDashboard"
> &
  Pick<EmbeddingAdditionalHashOptions, "locale"> &
  Pick<WithRouterProps, "location">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  location,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider {...contextProps}>
    <DashboardLocationSync location={location} />
    <PublicOrEmbeddedDashboardView />
  </DashboardContextProvider>
);
