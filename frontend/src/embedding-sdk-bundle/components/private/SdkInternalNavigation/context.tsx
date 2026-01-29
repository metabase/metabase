import { createContext, useContext } from "react";

import type { MetabaseQuestion } from "embedding-sdk-bundle/types";
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type {
  NavigateToNewCardParams,
  SdkQuestionId,
} from "embedding-sdk-bundle/types/question";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

import type { SdkQuestionProps } from "../../public/SdkQuestion/SdkQuestion";

export type SdkInternalNavigationEntry =
  | {
      type: "dashboard";
      id: SdkDashboardId;
      name: string;
      parameters?: ParameterValues;
    }
  | {
      type: "question";
      id: SdkQuestionId;
      name: string;
      parameters?: ParameterValues;
    }
  | {
      type: "adhoc-question";
      /** The URL path for the ad-hoc question (e.g., /question#... with serialized card) */
      questionPath: string;
      name: string;
    }
  | {
      type: "new-question";
      /** The dashboard ID to add the new question to */
      dashboardId: SdkDashboardId;
      /** The dashboard name for the back button */
      dashboardName: string;
      /** Display name for the back button (same as dashboardName) */
      name: string;
      /** Props to pass to the data picker (e.g., entityTypes filter) */
      dataPickerProps?: Pick<SdkQuestionProps, "entityTypes">;
      /** Callback when the question is successfully created */
      onQuestionCreated: (question: MetabaseQuestion) => void;
    };

export type SdkInternalNavigationContextValue = {
  stack: SdkInternalNavigationEntry[];
  push: (entry: SdkInternalNavigationEntry) => void;
  pop: () => void;
  currentEntry: SdkInternalNavigationEntry | undefined;
  canGoBack: boolean;
  previousEntry: SdkInternalNavigationEntry | undefined;
  navigateToNewCard: (params: NavigateToNewCardParams) => Promise<void>;
  navigateToNewCardFromDashboard: (
    opts: NavigateToNewCardFromDashboardOpts,
  ) => void;
  initWithDashboard: (dashboard: { id: number; name: string }) => void;
};

export const SdkInternalNavigationContext =
  createContext<SdkInternalNavigationContextValue | null>(null);

export const useSdkInternalNavigation =
  (): SdkInternalNavigationContextValue => {
    const ctx = useContext(SdkInternalNavigationContext);
    if (!ctx) {
      throw new Error(
        "useSdkInternalNavigation must be used within SdkInternalNavigationProvider",
      );
    }
    return ctx;
  };

/**
 * Optional version of useSdkInternalNavigation that returns null if outside provider.
 * Useful for components that may be rendered outside the navigation context.
 */
export const useSdkInternalNavigationOptional = () => {
  return useContext(SdkInternalNavigationContext);
};
