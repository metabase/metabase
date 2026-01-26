/* eslint-disable react-hooks/rules-of-hooks */
import {
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import * as Urls from "metabase/lib/urls";

import { SdkQuestion } from "../../public/SdkQuestion";
import { InteractiveDashboardContent } from "../../public/dashboard/InteractiveDashboard/InteractiveDashboard";
import type { SdkDashboardInnerProps } from "../../public/dashboard/SdkDashboard";
import { SdkAdHocQuestion } from "../SdkAdHocQuestion";

import { SdkInternalNavigationBackButton } from "./SdkInternalNavigationBackButton";
import {
  SdkInternalNavigationContext,
  type SdkInternalNavigationEntry,
} from "./context";

type Props = {
  children: ReactNode;
  dashboardProps?: Partial<Omit<SdkDashboardInnerProps, "dashboardId">>;
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
    async (params: { nextCard: { name?: string | null } }) => {
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
          name: nextCard.name || t`Question`,
        }));
      } else {
        push({
          type: "adhoc-question",
          questionPath: url,
          name: nextCard.name || t`Question`,
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
          initialSqlParameters={currentEntry.parameters}
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
