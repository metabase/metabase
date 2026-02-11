import { createContext, useContext } from "react";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { SdkQuestionId } from "embedding-sdk-bundle/types/question";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";

// This type exists only to have a global place where to put the JSDoc for virtual
type BaseEntry = {
  /** "Virtual" entries are entries that are rendered by the previous entity and not by the SdkInternalNavigationProvider directly (ie: drills, new question from dashboard)
   * We still need the entry object in the stack to keep track of them and make the back button work correctly
   */
  virtual?: boolean;
};

export type SdkInternalNavigationEntry =
  | (BaseEntry & {
      type: "dashboard";
      id: SdkDashboardId;
      name: string;
      virtual?: true;
      parameters?: ParameterValues;
      onPop?: () => void;
    })
  | (BaseEntry & {
      type: "question";
      id: SdkQuestionId;
      name: string;
      virtual?: true;
      parameters?: ParameterValues;
      onPop?: () => void;
    })
  | (BaseEntry & {
      type: "metabase-browser";
      virtual: false;
      onPop?: () => void;
    })
  | (BaseEntry & {
      /** Parent component handles rendering, this just tracks navigation depth */
      type: "question-drill";
      virtual: true;
      name: string;
      onPop?: () => void;
    })
  | (BaseEntry & {
      /** Opening a card from dashboard (clicking card title or click behavior) */
      type: "open-card";
      virtual: true;
      name: string;
      onPop?: () => void;
    })
  | (BaseEntry & {
      /** New question creation from dashboard */
      type: "new-question";
      virtual: true;
      onPop?: () => void;
    });

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
