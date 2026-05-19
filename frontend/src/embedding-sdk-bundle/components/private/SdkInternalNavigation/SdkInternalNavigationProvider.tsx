import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { match } from "ts-pattern";

import { SdkDashboardStyledWrapper } from "embedding-sdk-bundle/components/public/dashboard/SdkDashboardStyleWrapper";
import { useSdkDispatch } from "embedding-sdk-bundle/store";
import { setInitialDashboardTabId } from "embedding-sdk-bundle/store/reducer";
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
import { setParameterValue } from "metabase/dashboard/actions";
import {
  getDashboardComplete,
  getSelectedTabId,
} from "metabase/dashboard/selectors";
import { useSelector } from "metabase/redux";
import { selectTab } from "metabase/redux/dashboard";
import { Stack } from "metabase/ui";

import { SdkQuestion } from "../../public/SdkQuestion";
import type {
  DrillThroughQuestionProps,
  SdkQuestionProps,
} from "../../public/SdkQuestion/SdkQuestion";
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
  /** When true, children are kept mounted (but hidden) during navigation instead of being unmounted */
  keepChildrenMounted?: boolean;
  style?: CSSProperties;
  className?: string;
};

const SdkInternalNavigationProviderInner = ({
  style,
  className,
  children,
  dashboardProps,
  renderDrillThroughQuestion: RenderDrillThroughQuestion,
  drillThroughQuestionProps,
  keepChildrenMounted = false,
}: Props) => {
  const [stack, setStack] = useState<SdkInternalNavigationEntry[]>([]);
  const dispatch = useSdkDispatch();
  const currentDashboard = useSelector(getDashboardComplete);
  const selectedTabId = useSelector(getSelectedTabId);

  const push = useCallback(
    (entry: SdkInternalNavigationEntry) => {
      // Click behaviors that target the currently loaded dashboard should
      // switch tab / apply parameters in place rather than push a new stack
      // entry (which would re-mount the dashboard from scratch and lose the
      // requested tab).
      if (
        entry.type === "dashboard" &&
        currentDashboard != null &&
        entry.id === currentDashboard.id
      ) {
        if (entry.tabId != null) {
          dispatch(selectTab({ tabId: entry.tabId }));
        }
        if (entry.parameterIdValuePairs) {
          // Merge per-parameter (matches core app DashboardClickAction) so
          // unrelated filters keep their current values.
          for (const [id, value] of entry.parameterIdValuePairs) {
            dispatch(setParameterValue(id, value));
          }
        }
        return;
      }
      // Handle cross dashboard navigation with initial tab.
      if (entry.type === "dashboard") {
        dispatch(setInitialDashboardTabId(entry.tabId ?? null));
      }
      setStack((prev) => {
        const top = prev.at(-1);
        // Capture the live selected tab onto the outgoing dashboard entry so
        // that popping back restores the tab the user was actually viewing
        // (which may differ from the tab the entry was opened on).
        const updated =
          top?.type === "dashboard"
            ? [
                ...prev.slice(0, -1),
                { ...top, tabId: selectedTabId ?? top.tabId },
              ]
            : prev;
        return [...updated, entry];
      });
    },
    [dispatch, currentDashboard, selectedTabId],
  );

  const pop = useCallback(() => {
    setStack((prev) => {
      const poppedEntry = prev.at(-1);
      // Call onPop for placeholder entries that require special logic
      if (poppedEntry && "onPop" in poppedEntry && poppedEntry.onPop) {
        poppedEntry.onPop();
      }
      const next = prev.slice(0, -1);
      const newTop = next.at(-1);
      if (newTop?.type === "dashboard") {
        // Seed the initial tab so the re-mounted dashboard lands on the tab
        // the user was last viewing instead of defaulting to the first tab.
        dispatch(setInitialDashboardTabId(newTop.tabId ?? null));
      }
      return next;
    });
  }, [dispatch]);

  // Initialize the stack with a dashboard entry (called by dashboard components when the dashboard loads and we have the name)
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

  // "Virtual" entries are entries that are rendered by the previous entity (ie: drills, new question from dashboard)
  // we don't have to render them, but we need them in the stack to make the back button work correctly
  const nonVirtualEntries = useMemo(
    () => stack.filter((entry) => !entry.virtual),
    [stack],
  );

  const entryToRender = nonVirtualEntries.at(-1);
  const entryIndex = entryToRender ? stack.indexOf(entryToRender) : -1;
  // If the entry is the original entry, we just need to return the children.
  const entryIsOriginalEntity = stack.length === 0 || entryIndex === 0;
  const hasNavigatedToEntity = !entryIsOriginalEntity;

  const value = useMemo(
    () => ({
      stack,
      push,
      pop,
      currentEntry: stack.at(-1),
      previousEntry: stack.at(-2),
      // When starting from the `metabase-browser`, we need to have > 2 items in
      // the stack to be able to go back, as the first navigation is handled by
      // the breadcrumbs.
      canGoBack: stack.filter((e) => e.type !== "metabase-browser").length > 1,
      initWithDashboard,
      hasNavigatedToEntity,
    }),
    [stack, push, pop, initWithDashboard, hasNavigatedToEntity],
  );

  const shouldRenderBackButton = match(stack.at(-1)?.type ?? null)
    .with(null, () => false)
    .with("dashboard", () => true)
    .with("question", () => false) // questions render their button in the header toolbar
    .otherwise(() => false); // all other navigations end up rendering a question (ad-hoc, new question etc)

  const maybeButton = shouldRenderBackButton ? (
    // Same padding as when the button is rendered inside the question, to minimize movement while navigating
    <Stack align="flex-start" p="md">
      <SdkInternalNavigationBackButton />
    </Stack>
  ) : null;

  const content = match({ activeEntry: entryToRender })
    .with({ activeEntry: { type: "dashboard" } }, ({ activeEntry }) => (
      <InteractiveDashboardContent
        {...dashboardProps}
        dashboardId={activeEntry.id}
        initialParameters={activeEntry.parameters}
        enableEntityNavigation
      />
    ))
    .with({ activeEntry: { type: "question" } }, ({ activeEntry }) => {
      // We try to infer question props from the starting dashboard when they have a 1:1 mapping
      const questionPropsInferredFromDashboard: Partial<SdkQuestionProps> = {
        withDownloads: dashboardProps?.withDownloads,
      };

      return (
        <SdkQuestion
          questionId={activeEntry.id}
          onNavigateBack={pop}
          initialSqlParameters={activeEntry.parameters}
          isSaveEnabled
          {...questionPropsInferredFromDashboard}
          {...drillThroughQuestionProps}
        >
          {RenderDrillThroughQuestion && <RenderDrillThroughQuestion />}
        </SdkQuestion>
      );
    })
    .otherwise(() => children);

  return (
    <SdkInternalNavigationContext.Provider value={value}>
      {/* When `keepChildrenMounted` is true, we keep the children mounted but hide them */}
      <div style={{ display: entryIsOriginalEntity ? "contents" : "none" }}>
        {entryIsOriginalEntity || keepChildrenMounted ? children : null}
      </div>
      {entryIsOriginalEntity ? null : (
        // When we don't render the children directly, we need to render a wrapper with the styles applied.
        // Otherwise we don't pass `style` and `className` to anything, we can't always wrap it otherwise we may render
        // paddings and borders twice.
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
 * This allows us to just wrap components with this and this will make sure to not
 * re-render the actual context provider.
 */
export const SdkInternalNavigationProvider = (props: Props) => {
  const isNested = useContext(SdkInternalNavigationContext);

  if (isNested) {
    return props.children;
  }

  return <SdkInternalNavigationProviderInner {...props} />;
};
