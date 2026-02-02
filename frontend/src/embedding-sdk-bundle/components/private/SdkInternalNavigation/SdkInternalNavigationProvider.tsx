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
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import type { NavigateToNewCardParams } from "embedding-sdk-bundle/types/question";
import * as Urls from "metabase/lib/urls";

import { SdkQuestion } from "../../public/SdkQuestion";
import type { DrillThroughQuestionProps } from "../../public/SdkQuestion/SdkQuestion";
import { InteractiveDashboardContent } from "../../public/dashboard/InteractiveDashboard/InteractiveDashboard";
import type { SdkDashboardInnerProps } from "../../public/dashboard/SdkDashboard";

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

/**
 * Inner component that contains all hooks. This is rendered only when not nested.
 * Separating this from the outer component fixes the React hooks rules violation
 * where hooks were being called conditionally based on the nesting check.
 */
const SdkInternalNavigationProviderInner = ({
  style,
  className,
  children,
  dashboardProps,
  renderDrillThroughQuestion: RenderDrillThroughQuestion,
  drillThroughQuestionProps,
}: Props) => {
  const [stack, setStack] = useState<SdkInternalNavigationEntry[]>([]);

  const push = useCallback((entry: SdkInternalNavigationEntry) => {
    setStack((prev) => [...prev, entry]);
  }, []);

  const pop = useCallback(() => {
    // Get the entry being popped before updating state
    const poppedEntry = stack.at(-1);
    setStack((prev) => prev.slice(0, -1));
    // Call onPop for placeholder entries (types starting with "placeholder-")
    if (poppedEntry && "onPop" in poppedEntry && poppedEntry.onPop) {
      poppedEntry.onPop();
    }
  }, [stack]);

  // Initialize the stack with a dashboard entry (called by dashboard components)
  const initWithDashboard = useCallback(
    (dashboard: { id: SdkDashboardId; name: string }) => {
      if (stack.length === 0) {
        setStack([
          { type: "dashboard", id: dashboard.id, name: dashboard.name },
        ]);
      }
    },
    [stack.length],
  );

  // Navigate to a new card (used for drilling from questions)
  const navigateToNewCard = useCallback(
    async (params: NavigateToNewCardParams) => {
      const { nextCard } = params;
      // Generate URL for the ad-hoc question
      const url = Urls.question(null, { hash: nextCard });
      const currentEntry = stack.at(-1);

      // If we're already on a placeholder adhoc question, just update its path instead of pushing
      // otherwise we'll have an entry for each filter change done from drills
      if (currentEntry?.type === "placeholder-adhoc-question") {
        setStack((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            type: "placeholder-adhoc-question",
            questionPath: url,
            name: nextCard.name || t`Question`,
          };
          return updated;
        });
      } else {
        push({
          type: "placeholder-adhoc-question",
          questionPath: url,
          name: nextCard.name || t`Question`,
        });
      }
    },
    [push, stack],
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

  // "Placeholder" entries are entries that are rendered by the previous entity (ie: drills, new question from dashboard)
  // we don't have to render them, but we need them in the stack to make the back button work correctly
  const nonPlaceholderEntries = useMemo(
    () => stack.filter((entry) => !entry.type.startsWith("placeholder")),
    [stack],
  );

  const entryToRender = nonPlaceholderEntries.at(-1);
  const entryIndex = entryToRender ? stack.indexOf(entryToRender) : -1;
  // If the entry is the original entry, we just need to return the children.
  const entryIsOriginalEntity = stack.length === 0 || entryIndex === 0;

  const shouldRenderBackButton = match(stack.at(-1)?.type ?? null)
    .with(null, () => false)
    .with("dashboard", () => true)
    .with("question", () => false) // questions render their button in the header toolbar
    .otherwise(() => false);

  const maybeButton = shouldRenderBackButton ? (
    <SdkInternalNavigationBackButton style={{ border: "1px solid red" }} />
  ) : null;

  const content = match({ activeEntry: entryToRender })
    .with({ activeEntry: { type: "dashboard" } }, ({ activeEntry }) => (
      <InteractiveDashboardContent
        {...dashboardProps}
        style={undefined}
        className={undefined}
        dashboardId={activeEntry.id}
        initialParameters={activeEntry.parameters}
      />
    ))
    .with({ activeEntry: { type: "question" } }, ({ activeEntry }) => (
      <SdkQuestion
        questionId={activeEntry.id}
        onNavigateBack={pop}
        navigateToNewCard={navigateToNewCard}
        initialSqlParameters={activeEntry.parameters}
        {...drillThroughQuestionProps}
      >
        {RenderDrillThroughQuestion && <RenderDrillThroughQuestion />}
      </SdkQuestion>
    ))
    .otherwise(() => children);

  // When we don't render the children directly, we need to render a wrapper with the styles applied.
  // Otherwise we don pass `style` and `className` to anything, we can't always wrap it otherwise we may render
  // paddings and borders twice.
  return (
    <SdkInternalNavigationContext.Provider value={value}>
      {entryIsOriginalEntity ? (
        children
      ) : (
        <SdkDashboardStyledWrapper className={className} style={style}>
          {maybeButton}
          {content}
        </SdkDashboardStyledWrapper>
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
