import { createContext, useContext } from "react";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

export type SdkInternalNavigationEntry =
  | {
      type: "dashboard";
      id: SdkDashboardId;
      name: string;
      parameters?: ParameterValues;
      onPop?: () => void;
    }
  | {
      type: "question";
      id: SdkQuestionId;
      name: string;
      parameters?: ParameterValues;
      onPop?: () => void;
    }
  | {
      /** Virtual entry for the metabase-browser collection view */
      type: "metabase-browser";
      onPop?: () => void;
    }
  | {
      /** Virtual entry for question drills - parent component handles rendering, this just tracks navigation depth */
      type: "virtual-question-drill";
      name: string;
      onPop?: () => void;
    }
  | {
      /** Virtual entry for opening a card from dashboard (clicking card title or click behavior) */
      type: "virtual-open-card";
      name: string;
      onPop?: () => void;
    }
  | {
      /** Virtual entry for new question creation from dashboard */
      type: "virtual-new-question";
      onPop?: () => void;
    }
  | {
      /** Virtual entry for dashboard opened from MetabaseBrowser — browser handles rendering */
      type: "virtual-dashboard";
      id: SdkDashboardId;
      name: string;
      onPop?: () => void;
    }
  | {
      /** Virtual entry for question/model/metric opened from MetabaseBrowser — browser handles rendering */
      type: "virtual-question";
      id: SdkQuestionId;
      name: string;
      onPop?: () => void;
    };

export type SdkInternalNavigationContextValue = {
  stack: SdkInternalNavigationEntry[];
  push: (entry: SdkInternalNavigationEntry) => void;
  pop: () => void;
  reset: () => void;
  currentEntry: SdkInternalNavigationEntry | undefined;
  canGoBack: boolean;
  previousEntry: SdkInternalNavigationEntry | undefined;
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
