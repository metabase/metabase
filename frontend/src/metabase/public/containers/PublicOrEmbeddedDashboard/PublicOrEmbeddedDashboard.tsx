import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import type { EmbeddingAdditionalHashOptions } from "metabase/public/lib/types";

import { PublicOrEmbeddedDashboardView } from "./PublicOrEmbeddedDashboardView";

export type PublicOrEmbeddedDashboardProps = Pick<
  DashboardContextProps,
  | "dashboardId"
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
  Pick<EmbeddingAdditionalHashOptions, "locale">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider {...contextProps}>
    <PublicOrEmbeddedDashboardView />
  </DashboardContextProvider>
);
