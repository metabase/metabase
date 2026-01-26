/* eslint-disable react-hooks/rules-of-hooks */
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type {
  NavigateToNewCardParams,
  SdkQuestionId,
} from "embedding-sdk-bundle/types/question";
import type { ParameterValues } from "metabase/embedding-sdk/types/dashboard";
import * as Urls from "metabase/lib/urls";
import { Button, Icon } from "metabase/ui";

import { SdkQuestion } from "../public/SdkQuestion";
import { InteractiveDashboardContent } from "../public/dashboard/InteractiveDashboard/InteractiveDashboard";
import type { SdkDashboardInnerProps } from "../public/dashboard/SdkDashboard";

import { SdkAdHocQuestion } from "./SdkAdHocQuestion";

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
    };

type SdkInternalNavigationContextValue = {
  stack: SdkInternalNavigationEntry[];
  push: (entry: SdkInternalNavigationEntry) => void;
  pop: () => void;
  currentEntry: SdkInternalNavigationEntry | undefined;
  canGoBack: boolean;
  previousEntry: SdkInternalNavigationEntry | undefined;
  navigateToNewCard: (params: NavigateToNewCardParams) => Promise<void>;
  initWithDashboard: (dashboard: { id: number; name: string }) => void;
};

const SdkInternalNavigationContext =
  createContext<SdkInternalNavigationContextValue | null>(null);

export const useSdkInternalNavigation = () => {
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

type Props = {
  children: ReactNode;
  dashboardProps?: Partial<Omit<SdkDashboardInnerProps, "dashboardId">>;
};

export const SdkInternalNavigationBackButton = () => {
  const { previousEntry, canGoBack, pop } = useSdkInternalNavigation();

  if (!canGoBack) {
    return null;
  }

  return (
    <Button
      variant="subtle"
      color="text-secondary"
      size="sm"
      leftSection={<Icon name="chevronleft" />}
      onClick={pop}
      // TODO: REMOVE BEFORE MERGING
      style={{ border: `var(--debug-border-red)` }}
    >
      {t`Back to ${previousEntry?.name}`}
    </Button>
  );
};

export const SdkInternalNavigationProvider = ({
  children,
  dashboardProps,
}: Props) => {
  const isNested = useContext(SdkInternalNavigationContext);
  if (isNested) {
    // TODO: fix conditional hooks
    return children;
  }

  const [stack, setStack] = useState<SdkInternalNavigationEntry[]>([]);

  const push = useCallback((entry: SdkInternalNavigationEntry) => {
    setStack((prev) => [...prev, entry]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => prev.slice(0, -1));
  }, []);

  const updateCurrentEntry = useCallback(
    (
      updater: (
        entry: SdkInternalNavigationEntry,
      ) => SdkInternalNavigationEntry,
    ) => {
      setStack((prev) => {
        if (prev.length === 0) {
          return prev;
        }
        const updated = [...prev];
        updated[updated.length - 1] = updater(updated[updated.length - 1]);
        return updated;
      });
    },
    [],
  );

  // Initialize the stack with a dashboard entry (called by dashboard components)
  const initWithDashboard = useCallback(
    (dashboard: { id: number; name: string }) => {
      if (stack.length === 0) {
        setStack([
          { type: "dashboard", id: dashboard.id, name: dashboard.name },
        ]);
      }
    },
    [stack.length],
  );

  // Custom navigateToNewCard that pushes to the navigation stack
  // This is used when drilling from a question to another ad-hoc question
  const navigateToNewCard = useCallback(
    async (params: NavigateToNewCardParams) => {
      const { nextCard } = params;
      // Generate URL for the ad-hoc question
      const url = Urls.question(null, { hash: nextCard });
      const currentEntry = stack.at(-1);

      // If we're already on an adhoc question, just update its path instead of pushing
      // otherwise we'll have an entry for each filter change done from drills
      if (currentEntry?.type === "adhoc-question") {
        updateCurrentEntry(() => ({
          type: "adhoc-question",
          questionPath: url,
          name: nextCard.name || "Question",
        }));
      } else {
        push({
          type: "adhoc-question",
          questionPath: url,
          name: nextCard.name || "Question",
        });
      }
    },
    [push, stack, updateCurrentEntry],
  );

  const value = useMemo(
    () => ({
      stack,
      push,
      pop,
      currentEntry: stack.at(-1),
      previousEntry: stack.at(-2),
      canGoBack: stack.length > 1,
      navigateToNewCard,
      initWithDashboard,
    }),
    [stack, push, pop, navigateToNewCard, initWithDashboard],
  );

  const currentEntry = value.currentEntry;

  // If stack is empty or only has initial entry, render children

  const content = match({ currentEntry, stackLength: stack.length })
    .when(
      ({ stackLength }) => stackLength <= 1,
      () => children,
    )
    .with({ currentEntry: { type: "dashboard" } }, ({ currentEntry }) => (
      <div style={{ height: "100%" }}>
        <SdkInternalNavigationBackButton />
        <InteractiveDashboardContent
          {...dashboardProps}
          dashboardId={currentEntry.id}
          initialParameters={currentEntry.parameters}
        />
      </div>
    ))
    .with({ currentEntry: { type: "question" } }, ({ currentEntry }) => (
      <div style={{ height: "100%" }}>
        <SdkQuestion
          questionId={currentEntry.id}
          onNavigateBack={pop}
          navigateToNewCard={navigateToNewCard}
        />
      </div>
    ))
    .with({ currentEntry: { type: "adhoc-question" } }, ({ currentEntry }) => (
      <div style={{ height: "100%" }}>
        <SdkAdHocQuestion
          questionPath={currentEntry.questionPath}
          onNavigateBack={pop}
          navigateToNewCard={navigateToNewCard}
        />
      </div>
    ))
    .otherwise(() => children);

  return (
    <SdkInternalNavigationContext.Provider value={value}>
      <DebugInfo stack={stack} />
      {content}
    </SdkInternalNavigationContext.Provider>
  );
};

const DebugInfo = ({ stack }: { stack: SdkInternalNavigationEntry[] }) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        padding: 20,
      }}
    >
      {/* eslint-disable-next-line i18next/no-literal-string */}
      <p>debug info</p>
      <div style={{ display: "flex", gap: 8 }}>
        {stack.map((entry, index) => {
          const isPreviousEntry = index === stack.length - 2;
          return (
            <pre
              key={index}
              style={{
                padding: 8,
                border: isPreviousEntry
                  ? `var(--debug-border-red)`
                  : `var(--debug-border-blue)`,
                maxWidth: "300px",
                overflow: "hidden",
                margin: 0,
              }}
            >
              {JSON.stringify(entry, null, 2)}
            </pre>
          );
        })}
      </div>
    </div>
  );
};
