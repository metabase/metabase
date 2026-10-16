import { type ReactNode, useEffect, useRef } from "react";

import { Warnings } from "metabase/common/components/Warnings";
import { Group, Paper, Stack, Title } from "metabase/ui";
import type { ClickActionsMode } from "metabase/visualizations/types";

/** For charts in a panel that have nothing to drill into. */
export const NO_CLICK_ACTIONS: ClickActionsMode = { actionsForClick: () => [] };

type SupportingPanelProps = {
  title: string;
  warnings?: string[];
  /** Shown at the right of the title, e.g. a range picker. */
  controls?: ReactNode;
  /** Changes with each request to bring the panel into view. */
  focusId?: number;
  children: ReactNode;
};

/**
 * One of the supporting analyses below an analysis's primary chart. They
 * share a scrolling column with the chart, so a panel can be scrolled to
 * when a chart click asks for it.
 */
export const SupportingPanel = ({
  title,
  warnings = [],
  controls,
  focusId,
  children,
}: SupportingPanelProps) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusId !== undefined) {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [focusId]);

  return (
    <Paper
      ref={ref}
      withBorder
      p="lg"
      style={{ flexShrink: 0, scrollMarginTop: "var(--mantine-spacing-md)" }}
      aria-label={title}
    >
      <Stack gap="lg">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            <Title order={4}>{title}</Title>
            <Warnings warnings={warnings} size={18} />
          </Group>
          {controls}
        </Group>
        {children}
      </Stack>
    </Paper>
  );
};
