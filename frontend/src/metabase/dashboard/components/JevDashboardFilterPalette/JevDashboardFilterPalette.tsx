import { useDisclosure } from "@mantine/hooks";
import { type ReactNode, useCallback, useMemo } from "react";
import { msgid, ngettext, t } from "ttag";

import { useSuggestDashboardFiltersMutation } from "metabase/api/jev-filters";
import { setParameterValue } from "metabase/dashboard/actions";
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

  useJevFilterHotkey({ enabled: true, isOpen: opened, onOpen: open });

  const rows = useMemo(() => parameters.map(getRowSpec), [parameters]);

  const suggest = useCallback(
    (text: string) => suggestFilters({ dashboardId, text }).unwrap(),
    [suggestFilters, dashboardId],
  );

  const handleApply = useCallback(
    (filters: JevAppliedFilter[]) => {
      filters.forEach(({ suggestion, value }) =>
        dispatch(setParameterValue(suggestion.parameter_id, value)),
      );
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
        suggest={suggest}
        onApply={handleApply}
      />
    </>
  );
}
