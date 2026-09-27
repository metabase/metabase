import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type {
  JevFilterSuggestion,
  JevFilterSuggestions,
} from "metabase/api/jev-filters";
import { Stack, Text } from "metabase/ui";

import type {
  JevAppliedFilter,
  JevPaletteRow,
  JevPaletteRowSpec,
  JevPaletteSelections,
} from "../../types";
import { isJevFilterHotkey } from "../../use-jev-filter-hotkey";
import {
  cycleSelection,
  getAppliedFilters,
  getDefaultSelection,
  getNoChangeIndex,
  getSelection,
  mergeRows,
} from "../../utils";
import {
  JevPaletteChip,
  JevPaletteFooter,
  JevPaletteInput,
  JevPaletteList,
  JevPaletteModal,
  JevPaletteNotice,
  JevPaletteRowFrame,
  JevPaletteSkeleton,
  getJevPaletteRowElementId,
  useJevPaletteKeys,
} from "../JevPalette";

export const JEV_FILTER_DEBOUNCE_MS = 300;

export interface JevFilterPaletteProps {
  opened: boolean;
  onClose: () => void;
  rows: readonly JevPaletteRowSpec[];
  isLoadingRows?: boolean;
  /** Latency to show before the first suggestion, e.g. from loading the rows. */
  rowsLatencyMs?: number;
  placeholder?: string;
  emptyMessage?: string;
  suggest: (text: string) => Promise<JevFilterSuggestions>;
  describeExtraRow?: (suggestion: JevFilterSuggestion) => JevPaletteRowSpec;
  onApply: (filters: JevAppliedFilter[]) => void;
}

export function JevFilterPalette({
  opened,
  onClose,
  ...contentProps
}: JevFilterPaletteProps) {
  return (
    <JevPaletteModal
      opened={opened}
      onClose={onClose}
      ariaLabel={t`Filter with Jev`}
      testId="jev-filter-palette"
    >
      <JevFilterPaletteContent onClose={onClose} {...contentProps} />
    </JevPaletteModal>
  );
}

type ContentProps = Omit<JevFilterPaletteProps, "opened">;

interface SuggestionState {
  requestId: number;
  text: string;
  response: JevFilterSuggestions;
}

function JevFilterPaletteContent({
  onClose,
  rows: rowSpecs,
  isLoadingRows = false,
  rowsLatencyMs,
  placeholder = t`Describe your filters…`,
  emptyMessage = t`No filters to set`,
  suggest,
  describeExtraRow,
  onApply,
}: ContentProps) {
  const listId = useId();
  const [text, setText] = useState("");
  const [result, setResult] = useState<SuggestionState | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selections, setSelections] = useState<JevPaletteSelections>({});
  const latestRequestIdRef = useRef(0);
  const lastRequestedTextRef = useRef("");
  const applyOnArrivalRef = useRef(false);
  const suggestRef = useLatest(suggest);
  const rowSpecsRef = useLatest(rowSpecs);
  const describeExtraRowRef = useLatest(describeExtraRow);
  const onApplyRef = useLatest(onApply);
  const onCloseRef = useLatest(onClose);

  const rows = useMemo(
    () => mergeRows(rowSpecs, result?.response.filters ?? [], describeExtraRow),
    [rowSpecs, result, describeExtraRow],
  );
  const clampedActiveIndex = Math.min(activeIndex, rows.length - 1);
  const activeRow = rows[clampedActiveIndex];

  const apply = useCallback(
    (applyRows: JevPaletteRow[], applySelections: JevPaletteSelections) => {
      const filters = getAppliedFilters(applyRows, applySelections);
      if (filters.length > 0) {
        onApplyRef.current(filters);
      }
      onCloseRef.current();
    },
    [onApplyRef, onCloseRef],
  );

  const submit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      if (trimmed === lastRequestedTextRef.current) {
        return;
      }
      lastRequestedTextRef.current = trimmed;
      const requestId = ++latestRequestIdRef.current;
      if (trimmed === "") {
        setResult(null);
        setSelections({});
        setIsFetching(false);
        return;
      }
      setIsFetching(true);
      let response: JevFilterSuggestions;
      try {
        response = await suggestRef.current(trimmed);
      } catch {
        response = {
          status: "unavailable",
          filters: [],
          candidate_count: 0,
          elapsed_ms: 0,
        };
      }
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      setIsFetching(false);
      setResult({ requestId, text: trimmed, response });
      setSelections({});
      if (applyOnArrivalRef.current) {
        applyOnArrivalRef.current = false;
        const nextRows = mergeRows(
          rowSpecsRef.current,
          response.filters,
          describeExtraRowRef.current,
        );
        if (getAppliedFilters(nextRows, {}).length > 0) {
          apply(nextRows, {});
        }
      }
    },
    [suggestRef, rowSpecsRef, describeExtraRowRef, apply],
  );

  useEffect(() => {
    const timeout = setTimeout(() => submit(text), JEV_FILTER_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [text, submit]);

  const handleEnter = () => {
    const trimmed = text.trim();
    const isUpToDate =
      !isFetching && trimmed === (result?.text ?? "") && trimmed !== "";
    if (isUpToDate || trimmed === "") {
      apply(rows, selections);
      return;
    }
    applyOnArrivalRef.current = true;
    submit(text);
  };

  const cycleActiveRow = (delta: 1 | -1) => {
    if (!activeRow || activeRow.options.length === 0) {
      return;
    }
    const current = getSelection(activeRow, selections);
    setSelections({
      ...selections,
      [activeRow.id]: cycleSelection(activeRow, current, delta),
    });
  };

  const moveActiveRow = (delta: 1 | -1) => {
    if (rows.length > 0) {
      setActiveIndex((clampedActiveIndex + delta + rows.length) % rows.length);
    }
  };

  const handleKeyDown = useJevPaletteKeys({
    onMove: moveActiveRow,
    onCycle: cycleActiveRow,
    onEnter: handleEnter,
    onClose,
    isOwnHotkey: isJevFilterHotkey,
  });

  const latencyMs = result
    ? (result.response.jev_ms ?? result.response.elapsed_ms)
    : rowsLatencyMs;
  const status = result?.response.status;
  const activeDescendant = activeRow
    ? getJevPaletteRowElementId(listId, clampedActiveIndex)
    : undefined;

  return (
    <Stack gap={0}>
      <JevPaletteInput
        listId={listId}
        activeDescendant={activeDescendant}
        ariaLabel={t`Describe your filters`}
        placeholder={placeholder}
        value={text}
        isFetching={isFetching}
        onChange={setText}
        onKeyDown={handleKeyDown}
      />
      <JevPaletteList id={listId} ariaLabel={t`Filters`}>
        {isLoadingRows && rows.length === 0 ? (
          <JevPaletteSkeleton testId="jev-filter-palette-skeleton" />
        ) : (
          rows.map((row, index) => (
            <JevPaletteRowItem
              key={row.suggestion ? `${row.id}:${result?.requestId}` : row.id}
              id={getJevPaletteRowElementId(listId, index)}
              row={row}
              isActive={index === clampedActiveIndex}
              selection={getSelection(row, selections)}
              onActivate={() => setActiveIndex(index)}
              onSelect={(selection) => {
                setActiveIndex(index);
                setSelections({ ...selections, [row.id]: selection });
              }}
            />
          ))
        )}
        {!isLoadingRows && rows.length === 0 && (
          <Text c="text-secondary" p="md" ta="center">
            {emptyMessage}
          </Text>
        )}
      </JevPaletteList>
      {status === "unavailable" && (
        <JevPaletteNotice>{t`Jev is unavailable right now`}</JevPaletteNotice>
      )}
      {status === "ok" && result?.response.filters.length === 0 && (
        <JevPaletteNotice>{t`No matching filters`}</JevPaletteNotice>
      )}
      <JevPaletteFooter
        hints={t`↑↓ filter · ⇥ ←→ value · ↵ apply · esc close`}
        latencyMs={latencyMs}
        latencyTestId="jev-filter-latency"
      />
    </Stack>
  );
}

interface JevPaletteRowItemProps {
  id: string;
  row: JevPaletteRow;
  isActive: boolean;
  selection: number;
  onActivate: () => void;
  onSelect: (selection: number) => void;
}

function JevPaletteRowItem({
  id,
  row,
  isActive,
  selection,
  onActivate,
  onSelect,
}: JevPaletteRowItemProps) {
  const noChangeIndex = getNoChangeIndex(row);
  const isGhostPick =
    row.suggestion != null &&
    getDefaultSelection(row) === noChangeIndex &&
    selection === noChangeIndex;

  return (
    <JevPaletteRowFrame
      id={id}
      name={row.name}
      icon={row.icon ?? "filter"}
      detail={row.currentValue}
      isActive={isActive}
      isHighlighted={row.suggestion != null}
      testId="jev-filter-row"
      onActivate={onActivate}
    >
      {row.options.map((option, index) => (
        <JevPaletteChip
          key={index}
          label={option.label}
          probability={option.probability}
          isSelected={selection === index}
          isGhost={isGhostPick && index === 0}
          onClick={() => onSelect(index)}
        />
      ))}
      <JevPaletteChip
        label={t`No change`}
        isSelected={selection === noChangeIndex}
        onClick={() => onSelect(noChangeIndex)}
      />
    </JevPaletteRowFrame>
  );
}
