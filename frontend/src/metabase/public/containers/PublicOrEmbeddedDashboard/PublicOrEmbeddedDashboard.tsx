import { PublicOrEmbeddedDashCardMenu } from "metabase/dashboard/components/DashCard/PublicOrEmbeddedDashCardMenu";
import { DASHBOARD_DISPLAY_ACTIONS } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/constants";
import { DASHBOARD_ACTION } from "metabase/dashboard/components/DashboardHeader/DashboardHeaderButtonRow/dashboard-action-keys";
import {
  type DashboardContextProps,
  DashboardContextProvider,
} from "metabase/dashboard/context";
import { isActionDashCard, isQuestionCard } from "metabase/dashboard/utils";
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
  | "dashcardMenu"
> &
  Pick<EmbeddingAdditionalHashOptions, "locale">;

export const PublicOrEmbeddedDashboard = ({
  locale,
  ...contextProps
}: PublicOrEmbeddedDashboardProps) => (
  <DashboardContextProvider
    {...contextProps}
    isDashcardVisible={(dashcard) => !isActionDashCard(dashcard)}
    dashcardMenu={
      contextProps.dashcardMenu ??
      (({ dashcard, result }) =>
        contextProps.downloadsEnabled?.results &&
        isQuestionCard(dashcard.card) &&
        !!result?.data &&
        !result?.error && (
          <PublicOrEmbeddedDashCardMenu result={result} dashcard={dashcard} />
        ))
    }
    dashboardActions={({ downloadsEnabled }) =>
      downloadsEnabled.pdf
        ? [...DASHBOARD_DISPLAY_ACTIONS, DASHBOARD_ACTION.DOWNLOAD_PDF]
        : DASHBOARD_DISPLAY_ACTIONS
    }
  >
    <PublicOrEmbeddedDashboardView />
  </DashboardContextProvider>
);
