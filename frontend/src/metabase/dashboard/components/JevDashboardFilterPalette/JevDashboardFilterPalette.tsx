import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo, useRef } from "react";
import { msgid, ngettext, t } from "ttag";
import _ from "underscore";

import {
  type DashboardFocus,
  useFocusDashboardMutation,
} from "metabase/api/jev";
import { useSuggestDashboardFiltersMutation } from "metabase/api/jev-filters";
import { setParameterValue } from "metabase/dashboard/actions";
import {
  setFocus,
  useFocusState,
} from "metabase/dashboard/components/DashboardFocus/focus-store";
import { formatParameterValue } from "metabase/parameters/utils/formatting";
import { getParameterIconName } from "metabase/parameters/utils/ui";
import {
  type JevAppliedFilter,
  JevFilterPalette,
  JevFilterPaletteButton,
  type JevPaletteRowSpec,
  useJevFilterHotkey,
} from "metabase/querying/jev-filters";
import { useDispatch } from "metabase/redux";
import type { UiParameter } from "metabase-lib/v1/parameters/types";
import type { DashboardId } from "metabase-types/api";

import {
  FOCUS_ROW_ID,
  combineSuggestions,
  getFocusRowSpec,
  getFocusSuggestion,
} from "./focus-row";

interface JevDashboardFilterPaletteProps {
  dashboardId: DashboardId;
  parameters: readonly UiParameter[];
}

function formatCurrentValue(parameter: UiParameter): ReactNode {
  const values = parameter.value == null ? [] : [parameter.value].flat();
  if (values.length > 1) {
    return ngettext(
      msgid`${values.length} selection`,
      `${values.length} selections`,
      values.length,
    );
  }
  const [value] = values;
  if (value == null || value === "") {
    return t`Any`;
  }
  return typeof value === "boolean"
    ? String(value)
    : formatParameterValue(value, parameter);
}

function getRowSpec(parameter: UiParameter): JevPaletteRowSpec {
  return {
    id: parameter.id,
    name: parameter.name,
    icon: getParameterIconName(parameter),
    currentValue: formatCurrentValue(parameter),
  };
}

export function JevDashboardFilterPalette({
  dashboardId,
  parameters,
}: JevDashboardFilterPaletteProps) {
  const dispatch = useDispatch();
  const [opened, { open, close }] = useDisclosure(false);
  const [suggestFilters] = useSuggestDashboardFiltersMutation();
  const [focusDashboard] = useFocusDashboardMutation();
  const { result: focusState } = useFocusState();
  const activeFocus =
    focusState?.dashboard_id === dashboardId ? focusState : null;
  const latestFocusRef = useRef<DashboardFocus | null>(null);

  useJevFilterHotkey({ enabled: true, isOpen: opened, onOpen: open });

  const rows = useMemo(
    () => [getFocusRowSpec(activeFocus), ...parameters.map(getRowSpec)],
    [activeFocus, parameters],
  );

  // One phrase drives both halves in parallel: filter values, and which cards answer the question.
  const suggest = useCallback(
    async (text: string) => {
      const startedAt = performance.now();
      const [filters, focus] = await Promise.allSettled([
        suggestFilters({ dashboardId, text }).unwrap(),
        typeof dashboardId === "number"
          ? focusDashboard({ dashboardId, intent: text }).unwrap()
          : null,
      ]);
      const focusResult = focus.status === "fulfilled" ? focus.value : null;
      latestFocusRef.current = focusResult;
      return combineSuggestions({
        filters: filters.status === "fulfilled" ? filters.value : null,
        focus: getFocusSuggestion(focusResult),
        elapsedMs: performance.now() - startedAt,
      });
    },
    [suggestFilters, focusDashboard, dashboardId],
  );

  const handleApply = useCallback(
    (applied: JevAppliedFilter[]) => {
      const [focusRows, parameterRows] = _.partition(
        applied,
        ({ suggestion }) => suggestion.parameter_id === FOCUS_ROW_ID,
      );
      parameterRows.forEach(({ suggestion, value }) =>
        dispatch(setParameterValue(suggestion.parameter_id, value)),
      );
      const focus = latestFocusRef.current;
      const shouldFocus = focusRows.some(
        ({ value }) => focus != null && value === focus.intent,
      );
      if (focus && shouldFocus) {
        setFocus(focus);
      }
    },
    [dispatch],
  );

  return (
    <>
      <JevFilterPaletteButton onClick={open} />
      <JevFilterPalette
        opened={opened}
        onClose={close}
        rows={rows}
        placeholder={t`Describe your filters, or ask a question…`}
        suggest={suggest}
        onApply={handleApply}
      />
    </>
  );
}
