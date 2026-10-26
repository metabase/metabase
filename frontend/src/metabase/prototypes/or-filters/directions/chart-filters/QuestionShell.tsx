import { type ReactNode, useEffect, useState } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Paper } from "metabase/ui";
import * as Lib from "metabase-lib";

import { QuestionTitle } from "../../harness/QuestionTitle";
import type { QuestionHeading } from "../../harness/heading";

import S from "./ChartFilters.module.css";
import type { DrillOptionTarget } from "./drillMenu";

const LANDED_MS = 1400;

/**
 * Query state for a question with drills: `apply` remembers the previous query
 * for the back button and which zone the change landed in, for a flash.
 */
export function useQuestionHistory(
  query: Lib.Query,
  onChange: (query: Lib.Query) => void,
) {
  const [history, setHistory] = useState<Lib.Query[]>([]);
  const [landed, setLanded] = useState<{
    target: DrillOptionTarget;
    key: number;
  }>();

  useEffect(() => {
    if (!landed) {
      return;
    }
    const timeout = setTimeout(() => setLanded(undefined), LANDED_MS);
    return () => clearTimeout(timeout);
  }, [landed]);

  return {
    canGoBack: history.length > 0,
    landed: landed?.target,
    landedKey: landed?.key,
    apply: (nextQuery: Lib.Query, target?: DrillOptionTarget) => {
      setHistory((previous) => [...previous, query]);
      onChange(nextQuery);
      if (target) {
        setLanded({ target, key: Date.now() });
      }
    },
    back: () => {
      const previous = history.at(-1);
      if (previous) {
        setHistory(history.slice(0, -1));
        onChange(previous);
      }
    },
  };
}

type QuestionShellProps = {
  query: Lib.Query;
  heading?: QuestionHeading;
  canGoBack: boolean;
  onBack: () => void;
  /** Prototype switches, top right. */
  settings?: ReactNode;
  children: ReactNode;
};

/** A query-builder view in miniature: back button, title, then the direction's zones. */
export function QuestionShell({
  query,
  heading,
  canGoBack,
  onBack,
  settings,
  children,
}: QuestionShellProps) {
  return (
    <Paper withBorder radius="md" p={0} style={{ overflow: "hidden" }}>
      <Group justify="space-between" px="xl" py="lg" wrap="nowrap">
        <Group gap="md" wrap="nowrap">
          {canGoBack && (
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={t`Back to previous results`}
              onClick={onBack}
            >
              <Icon name="arrow_left" />
            </ActionIcon>
          )}
          <QuestionTitle
            heading={heading ?? { title: Lib.suggestedName(query) }}
          />
        </Group>
        <Group gap="lg">{settings}</Group>
      </Group>
      {children}
    </Paper>
  );
}

type LandedFlashProps = {
  /** Changes on every landing, so the animation replays. */
  landedKey: number | undefined;
};

/** Outlines its parent for a moment when a click lands a filter there. Parent needs `pos="relative"`. */
export function LandedFlash({ landedKey }: LandedFlashProps) {
  if (landedKey == null) {
    return null;
  }
  return (
    <Box
      key={landedKey}
      className={S.landed}
      pos="absolute"
      inset={0}
      style={{ pointerEvents: "none" }}
    />
  );
}
