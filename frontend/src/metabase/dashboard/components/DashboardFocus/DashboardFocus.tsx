import { useEffect } from "react";
import { t } from "ttag";

import type { DashboardFocus as DashboardFocusResult } from "metabase/api/jev";
import { ActionIcon, Badge, Group, Icon, Text, Tooltip } from "metabase/ui";
import type { DashboardId } from "metabase-types/api";

import S from "./DashboardFocus.module.css";
import { clearFocus, useFocusState } from "./focus-store";

const DIMMED_CLASS = "jev-focus-dimmed";
const HIGHLIGHTED_CLASS = "jev-focus-highlighted";

/** Toggle dim/highlight classes on the rendered dashcards, by their data-dashcard-id. */
function applyFocusToDashcards(cards: DashboardFocusResult["cards"] | null) {
  const containers =
    document.querySelectorAll<HTMLElement>("[data-dashcard-id]");
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
  dashboardId: DashboardId;
}

/**
 * What the dashboard is currently "pointed at". Focus is set from the Jev filter palette (Cmd/Ctrl+F):
 * relevant cards ring and rise, the rest dim and sink. This chip names the question, calls out the
 * filters that help answer it, and clears the focus. A read-only view — the saved dashboard never changes.
 */
export const DashboardFocus = ({ dashboardId }: DashboardFocusProps) => {
  const { result } = useFocusState();
  const focus = result?.dashboard_id === dashboardId ? result : null;

  useEffect(() => {
    applyFocusToDashcards(focus?.cards ?? null);
  }, [focus]);

  useEffect(() => {
    return () => {
      applyFocusToDashcards(null);
      clearFocus();
    };
  }, [dashboardId]);

  if (!focus) {
    return null;
  }

  const helpfulFilters = focus.filters.filter((filter) => filter.highlight);

  return (
    <Group
      className={S.panel}
      gap="sm"
      px="md"
      py="sm"
      mb="md"
      wrap="wrap"
      data-testid="dashboard-focus"
    >
      <Icon name="sparkles" c="brand" />
      <Text size="sm" flex={1} truncate>
        {t`Focused on “${focus.intent}”`}
      </Text>
      {helpfulFilters.length > 0 && (
        <Group gap="xs" wrap="wrap" align="center">
          <Text size="sm" c="text-secondary">{t`Filters that help:`}</Text>
          {helpfulFilters.map((filter) => (
            <Badge key={filter.slug} color="brand" variant="light">
              {filter.name}
            </Badge>
          ))}
        </Group>
      )}
      <Tooltip label={t`Clear focus`}>
        <ActionIcon
          variant="subtle"
          aria-label={t`Clear focus`}
          onClick={clearFocus}
        >
          <Icon name="close" />
        </ActionIcon>
      </Tooltip>
    </Group>
  );
};
