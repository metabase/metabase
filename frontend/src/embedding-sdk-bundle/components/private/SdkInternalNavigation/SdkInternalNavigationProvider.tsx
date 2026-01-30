import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { SdkDashboardStyledWrapper } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboardStyleWrapper";
import { useSdkStore } from "embedding-sdk-bundle/store";
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types/question";
import { getNewCardUrl } from "metabase/dashboard/actions/getNewCardUrl";
import type { NavigateToNewCardFromDashboardOpts } from "metabase/dashboard/components/DashCard/types";
import * as Urls from "metabase/lib/urls";
import { getMetadata } from "metabase/selectors/metadata";
import { Stack } from "metabase/ui";
import { cardIsEquivalent } from "metabase-lib/v1/queries/utils/card";
import type { QuestionDashboardCard } from "metabase-types/api";

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
  /** The dashboard ID for navigateToNewCardFromDashboard */
  dashboardId?: SdkDashboardId | null;
  dashboardProps?: Partial<Omit<SdkDashboardInnerProps, "dashboardId">>;
  /** Custom renderer for drill-through questions */
  renderDrillThroughQuestion?: () => ReactNode;
  /** Props to pass to drill-through question components */
  drillThroughQuestionProps?: DrillThroughQuestionProps;
  style?: CSSProperties;
  className?: string;
};

/**
 * Inner component that contains all hooks. This is rendered only when not nested.
 * Separating this from the outer component fixes the React hooks rules violation
 * where hooks were being called conditionally based on the nesting check.
 */
const SdkInternalNavigationProviderInner = ({
  style,
  className,
  children,
  dashboardId,
  dashboardProps,
  renderDrillThroughQuestion: RenderDrillThroughQuestion,
  drillThroughQuestionProps,
}: Props) => {
  const [stack, setStack] = useState<SdkInternalNavigationEntry[]>([]);
  const isNavigatingRef = useRef(false);
  const store = useSdkStore();

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
      // Prevent race conditions from rapid clicks
      if (isNavigatingRef.current) {
        console.warn(
          "[SDK Navigation] Navigation already in progress, ignoring",
        );
        return;
      }
      isNavigatingRef.current = true;

      try {
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
      } catch (error) {
        console.warn("[SDK Navigation] Failed to navigate to new card:", error);
      } finally {
        isNavigatingRef.current = false;
      }
    },
    [push, stack, updateCurrentEntry],
  );

  // Navigate to a new card from a dashboard context (for drills and "go to card" actions)
  const navigateToNewCardFromDashboard = useCallback(
    ({
      nextCard,
      previousCard,
      dashcard,
      objectId,
    }: NavigateToNewCardFromDashboardOpts) => {
      const state = store.getState();
      const metadata = getMetadata(state);
      const { dashboards, parameterValues } = state.dashboard;

      if (dashboardId == null) {
        console.warn(
          "[SDK Navigation] dashboardId is null in navigateToNewCardFromDashboard",
        );
        return;
      }

      // Find the dashboard by ID (numeric or entity ID)
      const dashboard = Object.values(dashboards).find(
        (d) =>
          d.id === dashboardId ||
          d.entity_id === dashboardId ||
          String(d.id) === String(dashboardId),
      );

      if (dashboard) {
        // Check if this is a "go to card" action (clicking card title) vs a drill action
        // When clicking on a card title, previousCard is undefined (from ChartCaption)
        // OR nextCard and previousCard are equivalent (from other places)
        const isGoToCardAction =
          (previousCard == null || cardIsEquivalent(nextCard, previousCard)) &&
          nextCard.id != null;

        if (isGoToCardAction) {
          // Navigate to the saved question directly
          push({
            type: "question",
            id: nextCard.id,
            name: nextCard.name || t`Question`,
          });
        } else {
          // This is a drill action - generate URL for adhoc question
          const url = getNewCardUrl({
            metadata,
            dashboard,
            parameterValues,
            nextCard,
            previousCard,
            dashcard: dashcard as QuestionDashboardCard,
            objectId,
          });

          if (url) {
            push({
              type: "adhoc-question",
              questionPath: url,
              name: nextCard.name || t`Question`,
            });
          }
        }
      }
    },
    [store, dashboardId, push],
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
      navigateToNewCardFromDashboard,
      initWithDashboard,
    }),
    [
      stack,
      push,
      pop,
      navigateToNewCard,
      navigateToNewCardFromDashboard,
      initWithDashboard,
    ],
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

/**
 * Outer component that handles the nesting check.
 * If already inside a navigation provider, just render children directly.
 * This pattern ensures hooks are always called consistently (not conditionally).
 */
export const SdkInternalNavigationProvider = (props: Props) => {
  const isNested = useContext(SdkInternalNavigationContext);

  if (isNested) {
    return props.children;
  }

  return <SdkInternalNavigationProviderInner {...props} />;
};
