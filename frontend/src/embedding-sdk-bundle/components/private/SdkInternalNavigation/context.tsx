import { createContext, useContext } from "react";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

export type SdkInternalNavigationEntry =
  | {
      type: "dashboard";
      id: SdkDashboardId;
      name: string;
      virtual?: true;
      parameters?: ParameterValues;
      onPop?: () => void;
    }
  | {
      type: "question";
      id: SdkQuestionId;
      name: string;
      virtual?: true;
      parameters?: ParameterValues;
      onPop?: () => void;
    }
  | {
      type: "metabase-browser";
      virtual: false;
      onPop?: () => void;
    }
  | {
      /** Parent component handles rendering, this just tracks navigation depth */
      type: "question-drill";
      virtual: true;
      name: string;
      onPop?: () => void;
    }
  | {
      /** Opening a card from dashboard (clicking card title or click behavior) */
      type: "open-card";
      virtual: true;
      name: string;
      onPop?: () => void;
    }
  | {
      /** New question creation from dashboard */
      type: "new-question";
      virtual: true;
      onPop?: () => void;
    };

export type SdkInternalNavigationContextValue = {
  stack: SdkInternalNavigationEntry[];
  push: (entry: SdkInternalNavigationEntry) => void;
  pop: () => void;
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
