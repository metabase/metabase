/* eslint-disable react-hooks/rules-of-hooks */
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { SdkDashboardStyledWrapper } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboardStyleWrapper";
import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types/question";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";

import { SdkQuestion } from "../../public/SdkQuestion";
import type { DrillThroughQuestionProps } from "../../public/SdkQuestion/SdkQuestion";
import { InteractiveDashboardContent } from "../../public/dashboard/InteractiveDashboard/InteractiveDashboard";
import type { SdkDashboardInnerProps } from "../../public/dashboard/SdkDashboard";
import { SdkAdHocQuestion } from "../SdkAdHocQuestion";
import { NewQuestionBuilder } from "../SdkQuestion/NewQuestionBuilder";

import { SdkInternalNavigationBackButton } from "./SdkInternalNavigationBackButton";
import {
  SdkInternalNavigationContext,
  type SdkInternalNavigationEntry,
} from "./context";

type Props = {
  children: ReactNode;
  dashboardProps?: Partial<Omit<SdkDashboardInnerProps, "dashboardId">>;
  /** Custom renderer for drill-through questions */
  renderDrillThroughQuestion?: () => ReactNode;
  /** Props to pass to drill-through question components */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
  style?: CSSProperties;
  className?: string;
};

export const SdkInternalNavigationProvider = ({
  style,
  className,
  children,
  dashboardProps,
  renderDrillThroughQuestion: RenderDrillThroughQuestion,
  drillThroughQuestionProps,
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
      <>
        <Stack align="flex-start">
          <SdkInternalNavigationBackButton />
        </Stack>
        <InteractiveDashboardContent
          {...dashboardProps}
          style={undefined}
          className={undefined}
          dashboardId={currentEntry.id}
          initialParameters={currentEntry.parameters}
        />
      </>
    ))
    .with({ currentEntry: { type: "question" } }, ({ currentEntry }) => (
      <SdkQuestion
        questionId={currentEntry.id}
        onNavigateBack={pop}
        navigateToNewCard={navigateToNewCard}
        initialSqlParameters={currentEntry.parameters}
        {...drillThroughQuestionProps}
      >
        {RenderDrillThroughQuestion && <RenderDrillThroughQuestion />}
      </SdkQuestion>
    ))
    .with({ currentEntry: { type: "adhoc-question" } }, ({ currentEntry }) => (
      <SdkAdHocQuestion
        questionPath={currentEntry.questionPath}
        onNavigateBack={pop}
        navigateToNewCard={navigateToNewCard}
        isSaveEnabled={false}
        {...drillThroughQuestionProps}
      >
        {RenderDrillThroughQuestion && <RenderDrillThroughQuestion />}
      </SdkAdHocQuestion>
    ))
    .with({ currentEntry: { type: "new-question" } }, ({ currentEntry }) => (
      <NewQuestionBuilder
        dashboardId={currentEntry.dashboardId}
        dashboardName={currentEntry.dashboardName}
        dataPickerProps={currentEntry.dataPickerProps}
        onNavigateBack={pop}
        onQuestionCreated={(question, _dashboardTabId) => {
          currentEntry.onQuestionCreated(question);
          pop();
        }}
      />
    ))
    .otherwise(() => children);

  return (
    <SdkInternalNavigationContext.Provider value={value}>
      {stack.length > 1 ? (
        <SdkDashboardStyledWrapper className={className} style={style}>
          {content}
        </SdkDashboardStyledWrapper>
      ) : (
        content
      )}
    </SdkInternalNavigationContext.Provider>
  );
};
