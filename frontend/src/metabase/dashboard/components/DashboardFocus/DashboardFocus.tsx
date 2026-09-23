import { type FormEvent, useCallback, useEffect, useState } from "react";
import { t } from "ttag";

import {
  type DashboardFocus as DashboardFocusResult,
  useFocusDashboardMutation,
} from "metabase/api/jev";
import {
  ActionIcon,
  Badge,
  Button,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from "metabase/ui";

import { clearFocus as clearFocusStore, setFocus } from "./focus-store";

import S from "./DashboardFocus.module.css";

const DIMMED_CLASS = "jev-focus-dimmed";
const HIGHLIGHTED_CLASS = "jev-focus-highlighted";

/** Toggle dim/highlight classes on the rendered dashcards, by their data-dashcard-id. */
function applyFocusToDashcards(cards: DashboardFocusResult["cards"] | null) {
  const containers = document.querySelectorAll<HTMLElement>(
    "[data-dashcard-id]",
  );
  containers.forEach((el) => {
    el.classList.remove(DIMMED_CLASS, HIGHLIGHTED_CLASS);
  });
  if (!cards) {
    return;
  }
  const focusedById = new Map(cards.map((c) => [c.dashcard_id, c.focused]));
  containers.forEach((el) => {
    const id = Number(el.dataset.dashcardId);
    const focused = focusedById.get(id);
    if (focused === true) {
      el.classList.add(HIGHLIGHTED_CLASS);
    } else if (focused === false) {
      el.classList.add(DIMMED_CLASS);
    }
  });
}

interface DashboardFocusProps {
  dashboardId: number;
}

/**
 * "Point this dashboard at a question." An intent box that asks Jev which cards and filters help answer
 * the stated question, then re-focuses the dashboard: relevant cards ring, the rest dim, and the useful
 * filters are called out. A read-only view — nothing about the saved dashboard changes.
 */
export const DashboardFocus = ({ dashboardId }: DashboardFocusProps) => {
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<DashboardFocusResult | null>(null);
  const [focusDashboard, { isLoading, error }] = useFocusDashboardMutation();

  const clearFocus = useCallback(() => {
    setResult(null);
    applyFocusToDashcards(null);
    clearFocusStore();
  }, []);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!intent.trim()) {
      return;
    }
    const res = await focusDashboard({ dashboardId, intent }).unwrap();
    setResult(res);
    applyFocusToDashcards(res.cards);
    // Drive the grid reflow: relevant cards rise, the rest sink (animated by react-grid-layout).
    setFocus(
      Object.fromEntries(res.cards.map((c) => [c.dashcard_id, c.score])),
    );
  };

  // Re-apply dim/highlight when the result changes (e.g. cards re-render on tab/filter change).
  useEffect(() => {
    if (result) {
      applyFocusToDashcards(result.cards);
    }
  }, [result]);

  // Clear focus ONLY on unmount — not on every result change, or setting a new result would
  // immediately wipe the reflow it just set.
  useEffect(() => {
    return () => {
      applyFocusToDashcards(null);
      clearFocusStore();
    };
  }, []);

  const highlightedFilters = result?.filters.filter((f) => f.highlight) ?? [];

  return (
    <Stack className={S.panel} gap="sm" p="md" mb="md">
      <form onSubmit={handleSubmit}>
        <Group gap="sm" wrap="nowrap">
          <Icon name="sparkles" c="brand" />
          <TextInput
            flex={1}
            value={intent}
            onChange={(e) => setIntent(e.currentTarget.value)}
            placeholder={t`What do you want to explore? e.g. "top sales companies this quarter"`}
            aria-label={t`Explore this dashboard for a question`}
          />
          <Button type="submit" loading={isLoading} disabled={!intent.trim()}>
            {t`Focus`}
          </Button>
          {result && (
            <Tooltip label={t`Clear focus`}>
              <ActionIcon variant="subtle" onClick={clearFocus}>
                <Icon name="close" />
              </ActionIcon>
            </Tooltip>
          )}
        </Group>
      </form>

      {isLoading && (
        <Group gap="xs">
          <Loader size="xs" />
          <Text c="text-secondary" size="sm">{t`Jev is reading the dashboard…`}</Text>
        </Group>
      )}

      {error != null && (
        <Text c="error" size="sm">{t`Couldn't focus the dashboard.`}</Text>
      )}

      {result && highlightedFilters.length > 0 && (
        <Group gap="xs" wrap="wrap" align="center">
          <Text size="sm" c="text-secondary">{t`Filters that help:`}</Text>
          {highlightedFilters.map((f) => (
            <Badge key={f.slug} color="brand" variant="light">
              {f.name}
            </Badge>
          ))}
        </Group>
      )}
    </Stack>
  );
};
