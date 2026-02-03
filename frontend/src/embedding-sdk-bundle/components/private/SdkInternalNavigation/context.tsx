import { createContext, useContext } from "react";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type {
  NavigateToNewCardParams,
  SdkQuestionId,
} from "embedding-sdk-bundle/types/question";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

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
      /** Virtual entry for question drills - parent component handles rendering, this just tracks navigation depth */
      type: "virtual-question-drill";
      onPop?: () => void;
    }
  | {
      /** Virtual entry for adhoc questions from dashboard drills */
      type: "virtual-adhoc-question";
      /** The URL path for the ad-hoc question (e.g., /question#... with serialized card) */
      questionPath: string;
      name: string;
      onPop?: () => void;
    }
  | {
      /** Virtual entry for new question creation from dashboard */
      type: "virtual-new-question";
      onPop?: () => void;
    };

export type SdkInternalNavigationContextValue = {
  stack: SdkInternalNavigationEntry[];
  push: (entry: SdkInternalNavigationEntry) => void;
  pop: () => void;
  currentEntry: SdkInternalNavigationEntry | undefined;
  canGoBack: boolean;
  previousEntry: SdkInternalNavigationEntry | undefined;
  navigateToNewCard: (params: NavigateToNewCardParams) => Promise<void>;
  initWithDashboard: (dashboard: { id: SdkDashboardId; name: string }) => void;
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
