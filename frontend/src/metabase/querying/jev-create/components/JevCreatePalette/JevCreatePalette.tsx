import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useLatest } from "react-use";
import { t } from "ttag";

import type { JevCreateIntentTable } from "metabase/api/jev-create";
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
} from "metabase/querying/jev-filters/components/JevPalette";
import { Stack } from "metabase/ui";

import { type JevCreateRow, cycleIndex } from "../../rows";
import { useJevCreateActions } from "../../use-jev-create-actions";
import { isJevCreateHotkey } from "../../use-jev-create-hotkey";
import { useJevCreatePlans } from "../../use-jev-create-plans";
import {
  type CreateAction,
  type JevCreateChoices,
  NO_CHOICES,
  getIntentLatencyMs,
  getNotice,
  getViewState,
} from "../../view-state";

export const JEV_CREATE_DEBOUNCE_MS = 300;

export interface JevCreatePaletteProps {
  opened: boolean;
  onClose: () => void;
}

export function JevCreatePalette({ opened, onClose }: JevCreatePaletteProps) {
  return (
    <JevPaletteModal
      opened={opened}
      onClose={onClose}
      ariaLabel={t`New with Jev`}
      testId="jev-create-palette"
    >
      <JevCreatePaletteContent onClose={onClose} />
    </JevPaletteModal>
  );
}

function JevCreatePaletteContent({ onClose }: { onClose: () => void }) {
  const listId = useId();
  const [text, setText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [choiceState, setChoiceState] = useState({
    requestId: -1,
    choices: NO_CHOICES,
  });
  const pendingEnterRef = useRef(false);
  const {
    intent,
    isFetchingIntent,
    questionPlans,
    dashboardPlans,
    submit,
    planQuestionOn,
  } = useJevCreatePlans();
  const { openQuestion, createWithCards, isCreating, failedKind } =
    useJevCreateActions();

  const choices =
    intent && choiceState.requestId === intent.requestId
      ? choiceState.choices
      : NO_CHOICES;
  const isIntentOk = intent?.response.status === "ok";

  const view = useMemo(
    () =>
      intent && isIntentOk
        ? getViewState(intent, choices, questionPlans, dashboardPlans)
        : null,
    [intent, isIntentOk, choices, questionPlans, dashboardPlans],
  );
  const rows = view?.rows ?? [];
  const clampedActiveIndex = Math.max(
    0,
    Math.min(activeIndex, rows.length - 1),
  );
  const activeRow = rows[clampedActiveIndex];

  const updateChoices = (
    update: (current: JevCreateChoices) => JevCreateChoices,
  ) => {
    if (intent) {
      setChoiceState({ requestId: intent.requestId, choices: update(choices) });
    }
  };

  const selectOption = (row: JevCreateRow, index: number) => {
    const { target } = row;
    switch (target.type) {
      case "kind": {
        const kind = target.kinds[index];
        updateChoices((current) => ({ ...current, kind }));
        return;
      }
      case "table": {
        const table: JevCreateIntentTable | undefined = target.tables[index];
        if (table) {
          updateChoices((current) => ({ ...current, tableId: table.id }));
          planQuestionOn(table);
        }
        return;
      }
      case "question": {
        const tableId = view?.tableId;
        if (tableId != null) {
          updateChoices((current) => ({
            ...current,
            questionSelections: {
              ...current.questionSelections,
              [tableId]: {
                ...current.questionSelections[tableId],
                [row.id]: index,
              },
            },
          }));
        }
        return;
      }
      case "card": {
        const kind = view?.kind;
        if (kind === "dashboard" || kind === "document") {
          updateChoices((current) => ({
            ...current,
            cardSelections: {
              ...current.cardSelections,
              [kind]: { ...current.cardSelections[kind], [row.id]: index },
            },
          }));
        }
        return;
      }
      case "dashboard-name":
        return;
    }
  };

  const runCreateAction = async (action: CreateAction) => {
    switch (action.type) {
      case "question":
        openQuestion(action.tableQuery, action.choices);
        onClose();
        return;
      case "cards":
        if (await createWithCards(action.kind, action.name, action.cardIds)) {
          onClose();
        }
        return;
      case "wait":
      case "none":
        return;
    }
  };
  const runCreateActionRef = useLatest(runCreateAction);

  const createAction = view?.createAction;
  useEffect(() => {
    if (!pendingEnterRef.current || !createAction) {
      return;
    }
    if (createAction.type !== "wait") {
      pendingEnterRef.current = false;
      runCreateActionRef.current(createAction);
    }
  }, [createAction, runCreateActionRef]);

  useEffect(() => {
    const timeout = setTimeout(() => submit(text), JEV_CREATE_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [text, submit]);

  const handleEnter = () => {
    const trimmed = text.trim();
    if (trimmed === "" || isCreating) {
      return;
    }
    const isUpToDate = !isFetchingIntent && intent?.text === trimmed;
    if (!isUpToDate) {
      pendingEnterRef.current = true;
      submit(text);
      return;
    }
    if (!createAction || createAction.type === "wait") {
      pendingEnterRef.current = createAction != null;
      return;
    }
    runCreateAction(createAction);
  };

  const handleTextChange = (value: string) => {
    pendingEnterRef.current = false;
    setText(value);
  };

  const handleKeyDown = useJevPaletteKeys({
    onMove: (delta) => {
      if (rows.length > 0) {
        setActiveIndex(
          (clampedActiveIndex + delta + rows.length) % rows.length,
        );
      }
    },
    onCycle: (delta) => {
      if (activeRow && activeRow.options.length > 1) {
        selectOption(activeRow, cycleIndex(activeRow, delta));
      }
    },
    onEnter: handleEnter,
    onClose,
    isOwnHotkey: isJevCreateHotkey,
  });

  const trimmedText = text.trim();
  const isWaitingForIntent =
    trimmedText !== "" && (intent == null || intent.text !== trimmedText);
  const showSkeleton = isWaitingForIntent && view == null;
  const notice = getNotice({
    text: trimmedText,
    intent,
    viewNotice: view?.notice ?? null,
    failedKind,
  });
  const latencyMs = view?.latencyMs ?? getIntentLatencyMs(intent);

  return (
    <Stack gap={0}>
      <JevPaletteInput
        listId={listId}
        activeDescendant={
          activeRow
            ? getJevPaletteRowElementId(listId, clampedActiveIndex)
            : undefined
        }
        ariaLabel={t`Describe what to create`}
        placeholder={t`Describe a question or dashboard to create…`}
        value={text}
        isFetching={
          isFetchingIntent || (view?.isLoadingPlan ?? false) || isCreating
        }
        onChange={handleTextChange}
        onKeyDown={handleKeyDown}
      />
      <JevPaletteList id={listId} ariaLabel={t`Plan`}>
        {showSkeleton && (
          <JevPaletteSkeleton testId="jev-create-palette-skeleton" count={4} />
        )}
        {!showSkeleton &&
          rows.map((row, index) => (
            <JevCreateRowItem
              key={`${view?.kind}:${view?.tableId}:${row.id}`}
              id={getJevPaletteRowElementId(listId, index)}
              row={row}
              isActive={index === clampedActiveIndex}
              onActivate={() => setActiveIndex(index)}
              onSelect={(optionIndex) => {
                setActiveIndex(index);
                selectOption(row, optionIndex);
              }}
            />
          ))}
        {!showSkeleton && view?.isLoadingPlan && (
          <JevPaletteSkeleton testId="jev-create-palette-plan-skeleton" />
        )}
      </JevPaletteList>
      {notice && <JevPaletteNotice>{notice}</JevPaletteNotice>}
      <JevPaletteFooter
        hints={t`↑↓ row · ⇥ ←→ option · ↵ create · esc close`}
        latencyMs={latencyMs}
        latencyTestId="jev-create-latency"
      />
    </Stack>
  );
}

interface JevCreateRowItemProps {
  id: string;
  row: JevCreateRow;
  isActive: boolean;
  onActivate: () => void;
  onSelect: (index: number) => void;
}

function JevCreateRowItem({
  id,
  row,
  isActive,
  onActivate,
  onSelect,
}: JevCreateRowItemProps) {
  return (
    <JevPaletteRowFrame
      id={id}
      name={row.name}
      icon={row.icon}
      detail={row.detail}
      isActive={isActive}
      isHighlighted={row.target.type !== "kind"}
      testId="jev-create-row"
      onActivate={onActivate}
    >
      {row.options.map((option, index) => (
        <JevPaletteChip
          key={index}
          label={option.label}
          probability={option.probability}
          icon={option.icon}
          isSelected={row.selectedIndex === index}
          isGhost={row.ghostIndex === index}
          onClick={() => onSelect(index)}
        />
      ))}
    </JevPaletteRowFrame>
  );
}
