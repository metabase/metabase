import cx from "classnames";
import {
  type KeyboardEvent,
  type MouseEvent,
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
  JevFilterAlternative,
  JevFilterSuggestion,
  JevFilterSuggestions,
} from "metabase/api/jev-filters";
import { Box, Icon, Loader, Modal, Skeleton, Stack, Text } from "metabase/ui";

import type {
  JevAppliedFilter,
  JevPaletteRow,
  JevPaletteRowSpec,
  JevPaletteSelections,
} from "../../types";
import { isJevFilterHotkey } from "../../use-jev-filter-hotkey";
import {
  cycleSelection,
  formatProbability,
  getAppliedFilters,
  getDefaultSelection,
  getNoChangeIndex,
  getSelection,
  mergeRows,
} from "../../utils";

import S from "./JevFilterPalette.module.css";

export const JEV_FILTER_DEBOUNCE_MS = 300;
const SKELETON_ROW_COUNT = 3;

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
    <Modal.Root
      opened={opened}
      onClose={onClose}
      size={680}
      centered={false}
      yOffset="10vh"
      closeOnEscape={false}
      padding={0}
    >
      <Modal.Overlay />
      <Modal.Content
        className={S.content}
        aria-label={t`Filter with Jev`}
        data-testid="jev-filter-palette"
      >
        <JevFilterPaletteContent onClose={onClose} {...contentProps} />
      </Modal.Content>
    </Modal.Root>
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
  const lastKeyWasCycleRef = useRef(false);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const isCaretAtEnd =
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length;
    const wasCycling = lastKeyWasCycleRef.current;
    lastKeyWasCycleRef.current = false;

    switch (event.key) {
      case "ArrowDown":
      case "ArrowUp":
        event.preventDefault();
        moveActiveRow(event.key === "ArrowDown" ? 1 : -1);
        return;
      case "Tab":
        // Stop the modal's focus trap from moving focus off the input.
        event.preventDefault();
        event.stopPropagation();
        cycleActiveRow(event.shiftKey ? -1 : 1);
        lastKeyWasCycleRef.current = true;
        return;
      case "ArrowRight":
        if (isCaretAtEnd && !event.shiftKey) {
          event.preventDefault();
          cycleActiveRow(1);
          lastKeyWasCycleRef.current = true;
        }
        return;
      case "ArrowLeft":
        // ← only cycles right after a cycle (or on empty text) so it can still move the caret.
        if (
          isCaretAtEnd &&
          !event.shiftKey &&
          (wasCycling || input.value === "")
        ) {
          event.preventDefault();
          cycleActiveRow(-1);
          lastKeyWasCycleRef.current = true;
        }
        return;
      case "Enter":
        event.preventDefault();
        handleEnter();
        return;
      case "Escape":
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      default:
        if (isJevFilterHotkey(event.nativeEvent)) {
          event.preventDefault();
        }
    }
  };

  const keepInputFocus = (event: MouseEvent) => event.preventDefault();

  const latencyMs = result
    ? (result.response.jev_ms ?? result.response.elapsed_ms)
    : rowsLatencyMs;
  const status = result?.response.status;
  const activeDescendant = activeRow
    ? getRowElementId(listId, clampedActiveIndex)
    : undefined;

  return (
    <Stack gap={0}>
      <Box className={S.inputRow}>
        <Icon name="sparkles" className={S.inputIcon} />
        <input
          className={S.input}
          data-autofocus
          role="combobox"
          aria-expanded
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeDescendant}
          aria-label={t`Describe your filters`}
          placeholder={placeholder}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => setText(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        {isFetching && <Loader size="xs" className={S.inputLoader} />}
      </Box>
      <Box
        id={listId}
        role="listbox"
        aria-label={t`Filters`}
        className={S.list}
        onMouseDown={keepInputFocus}
      >
        {isLoadingRows && rows.length === 0 ? (
          <JevPaletteSkeleton />
        ) : (
          rows.map((row, index) => (
            <JevPaletteRowItem
              key={row.suggestion ? `${row.id}:${result?.requestId}` : row.id}
              id={getRowElementId(listId, index)}
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
      </Box>
      {status === "unavailable" && (
        <Text size="sm" c="text-secondary" px="xl" pb="sm">
          {t`Jev is unavailable right now`}
        </Text>
      )}
      {status === "ok" && result?.response.filters.length === 0 && (
        <Text size="sm" c="text-secondary" px="xl" pb="sm">
          {t`No matching filters`}
        </Text>
      )}
      <Box className={S.footer}>
        <Text component="span" size="xs" c="inherit">
          {t`↑↓ filter · ⇥ ←→ value · ↵ apply · esc close`}
        </Text>
        {latencyMs != null && (
          <Text
            component="span"
            size="xs"
            c="inherit"
            className={S.latency}
            data-testid="jev-filter-latency"
          >
            {t`Jev · ${Math.round(latencyMs)}ms`}
          </Text>
        )}
      </Box>
    </Stack>
  );
}

function getRowElementId(listId: string, index: number) {
  return `${listId}-row-${index}`;
}

function JevPaletteSkeleton() {
  return (
    <Stack gap="sm" p="sm" data-testid="jev-filter-palette-skeleton">
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
        <Skeleton key={index} h="1.75rem" radius="sm" />
      ))}
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
    <Box
      id={id}
      role="option"
      aria-selected={isActive}
      aria-label={row.name}
      className={cx(S.row, {
        [S.rowActive]: isActive,
        [S.rowSuggested]: row.suggestion != null,
      })}
      onClick={onActivate}
      data-testid="jev-filter-row"
    >
      <Icon name={row.icon ?? "filter"} c="text-secondary" />
      <Box className={S.rowName}>
        <Text fw="bold" truncate>
          {row.name}
        </Text>
        {row.currentValue != null && (
          <Text size="xs" c="text-secondary" truncate>
            {row.currentValue}
          </Text>
        )}
      </Box>
      <Box className={S.options}>
        {row.options.map((option, index) => (
          <JevOptionChip
            key={index}
            option={option}
            isSelected={selection === index}
            isGhost={isGhostPick && index === 0}
            onClick={() => onSelect(index)}
          />
        ))}
        <button
          type="button"
          className={cx(S.option, {
            [S.optionSelected]: selection === noChangeIndex,
          })}
          aria-pressed={selection === noChangeIndex}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(noChangeIndex);
          }}
        >
          {t`No change`}
        </button>
      </Box>
    </Box>
  );
}

interface JevOptionChipProps {
  option: JevFilterAlternative;
  isSelected: boolean;
  isGhost: boolean;
  onClick: () => void;
}

function JevOptionChip({
  option,
  isSelected,
  isGhost,
  onClick,
}: JevOptionChipProps) {
  return (
    <button
      type="button"
      className={cx(S.option, {
        [S.optionSelected]: isSelected,
        [S.optionGhost]: isGhost,
      })}
      aria-pressed={isSelected}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className={S.optionLabel}>{option.label}</span>
      <span className={S.probability}>
        {formatProbability(option.probability)}
      </span>
    </button>
  );
}
