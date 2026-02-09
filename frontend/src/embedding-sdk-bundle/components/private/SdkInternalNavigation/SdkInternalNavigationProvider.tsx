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
import type { SdkDashboardId } from "embedding-sdk-bundle/types/dashboard";
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
  /** When true, children are kept mounted (hidden) during navigation instead of being unmounted */
  keepMounted?: boolean;
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
  keepMounted = false,
}: Props) => {
  const [stack, setStack] = useState<SdkInternalNavigationEntry[]>([]);

  const push = useCallback((entry: SdkInternalNavigationEntry) => {
    setStack((prev) => [...prev, entry]);
  }, []);

  const reset = useCallback(() => {
    setStack([]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => {
      const poppedEntry = prev.at(-1);
      // Call onPop for placeholder entries that require special logic
      if (poppedEntry && "onPop" in poppedEntry && poppedEntry.onPop) {
        poppedEntry.onPop();
      }
      return prev.slice(0, -1);
    });
  }, []);

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

  const value = useMemo(
    () => ({
      stack,
      push,
      pop,
      reset,
      currentEntry: stack.at(-1),
      previousEntry: stack.at(-2),
      canGoBack: stack.filter((e) => e.type !== "metabase-browser").length > 1,
      initWithDashboard,
    }),
    [stack, push, pop, reset, initWithDashboard],
  );

  // "Virtual" entries are entries that are rendered by the previous entity (ie: drills, new question from dashboard)
  // we don't have to render them, but we need them in the stack to make the back button work correctly
  const nonVirtualEntries = useMemo(
    () => stack.filter((entry) => !entry.type.startsWith("virtual")),
    [stack],
  );

  const entryToRender = nonVirtualEntries.at(-1);
  const entryIndex = entryToRender ? stack.indexOf(entryToRender) : -1;
  const entryIsOriginalEntity = !entryToRender || entryIndex === 0;

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
        style={undefined}
        className={undefined}
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

  if (keepMounted) {
    // Keep children always mounted at the same DOM position to prevent unmount/remount.
    // Use display:contents when visible (transparent wrapper) and display:none when hidden.
    return (
      <SdkInternalNavigationContext.Provider value={value}>
        <div style={{ display: entryIsOriginalEntity ? "contents" : "none" }}>
          {children}
        </div>
        {!entryIsOriginalEntity && (
          <SdkDashboardStyledWrapper className={className} style={style}>
            {maybeButton}
            {content}
          </SdkDashboardStyledWrapper>
        )}
      </SdkInternalNavigationContext.Provider>
    );
  }

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
