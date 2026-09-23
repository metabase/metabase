import { useDisclosure } from "@mantine/hooks";
import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  type JevFilterSuggestion,
  type JevQuestionSlots,
  useGetQuestionFilterSlotsMutation,
  useSuggestQuestionFiltersMutation,
} from "metabase/api/jev-filters";
import type * as Lib from "metabase-lib";

import {
  applyJevFilters,
  getJevQuestionColumns,
  getJevQuestionRowSpec,
} from "../../question-utils";
import type { JevAppliedFilter, JevPaletteRowSpec } from "../../types";
import { useJevFilterHotkey } from "../../use-jev-filter-hotkey";
import { JevFilterPalette } from "../JevFilterPalette";
import { JevFilterPaletteButton } from "../JevFilterPaletteButton";

interface JevQuestionFilterPaletteProps {
  query: Lib.Query;
  questionName?: string;
  onQueryChange: (query: Lib.Query) => void;
}

export function JevQuestionFilterPalette({
  query,
  questionName,
  onQueryChange,
}: JevQuestionFilterPaletteProps) {
  const [opened, { open, close }] = useDisclosure(false);
  const [getSlots] = useGetQuestionFilterSlotsMutation();
  const [suggestFilters] = useSuggestQuestionFiltersMutation();
  const [slotsResult, setSlotsResult] = useState<JevQuestionSlots | null>(null);

  const columnsByKey = useMemo(() => getJevQuestionColumns(query), [query]);
  const columns = useMemo(
    () => Array.from(columnsByKey.values(), (entry) => entry.info),
    [columnsByKey],
  );

  useJevFilterHotkey({
    enabled: columns.length > 0,
    isOpen: opened,
    onOpen: open,
  });

  useEffect(() => {
    if (!opened) {
      setSlotsResult(null);
      return;
    }
    let isCancelled = false;
    getSlots({ question_name: questionName, columns })
      .unwrap()
      .catch(
        (): JevQuestionSlots => ({
          status: "unavailable",
          elapsed_ms: 0,
          slots: [],
        }),
      )
      .then((result) => {
        if (!isCancelled) {
          setSlotsResult(result);
        }
      });
    return () => {
      isCancelled = true;
    };
  }, [opened, getSlots, questionName, columns]);

  const slots = useMemo(() => slotsResult?.slots ?? [], [slotsResult]);
  const rows = useMemo(
    () =>
      slots.flatMap((slot): JevPaletteRowSpec[] => {
        const entry = columnsByKey.get(slot.key);
        return entry
          ? [getJevQuestionRowSpec(query, entry, slot.display_name)]
          : [];
      }),
    [slots, columnsByKey, query],
  );

  const suggest = useCallback(
    (text: string) =>
      suggestFilters({
        text,
        question_name: questionName,
        columns,
        slot_keys: slots.map((slot) => slot.key),
      }).unwrap(),
    [suggestFilters, questionName, columns, slots],
  );

  const describeExtraRow = useCallback(
    (suggestion: JevFilterSuggestion): JevPaletteRowSpec => {
      const entry = columnsByKey.get(suggestion.parameter_id);
      return entry
        ? getJevQuestionRowSpec(query, entry)
        : { id: suggestion.parameter_id, name: suggestion.parameter_name };
    },
    [columnsByKey, query],
  );

  const handleApply = useCallback(
    (filters: JevAppliedFilter[]) => {
      const newQuery = applyJevFilters(query, columnsByKey, filters);
      if (newQuery !== query) {
        onQueryChange(newQuery);
      }
    },
    [query, columnsByKey, onQueryChange],
  );

  if (columns.length === 0) {
    return null;
  }

  return (
    <>
      <JevFilterPaletteButton onClick={open} />
      <JevFilterPalette
        opened={opened}
        onClose={close}
        rows={rows}
        isLoadingRows={slotsResult == null}
        rowsLatencyMs={
          slotsResult
            ? (slotsResult.jev_ms ?? slotsResult.elapsed_ms)
            : undefined
        }
        emptyMessage={t`Describe a filter to get started`}
        suggest={suggest}
        describeExtraRow={describeExtraRow}
        onApply={handleApply}
      />
    </>
  );
}
