import {
  acceptCompletion,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { usePrevious } from "react-use";

import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { Box, DelayGroup, Icon, Popover } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";
import type { Completion } from "../types";
import { enclosingFunction } from "../util";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  stageIndex,
  metadata,
  reportTimezone,
  tooltipRef,

  state,
  view,
}: {
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  reportTimezone?: string;

  // from tooltip extension
  tooltipRef: React.RefObject<HTMLDivElement>;
  state: EditorState;
  view: EditorView;
}) {
  const doc = state.doc.toString();
  const handleCompletionClick = useCallback(
    (index: number) => {
      if (!view) {
        return;
      }

      view.dispatch({
        effects: [setSelectedCompletion(index)],
      });
      acceptCompletion(view);
    },
    [view],
  );

  const { options, selectedOption } = useCompletions(state);
  const enclosingFn = enclosingFunction(doc, state.selection.main.head);

  return (
    <Popover
      opened
      position="bottom-start"
      returnFocus
      closeOnEscape
      middlewares={{ shift: false, flip: false }}
      positionDependencies={[doc, state.selection.main.head]}
    >
      <Popover.Target>
        <div />
      </Popover.Target>
      <Popover.Dropdown
        data-testid="custom-expression-editor-suggestions"
        className={S.dropdown}
      >
        <div className={S.tooltip} ref={tooltipRef}>
          <HelpText
            enclosingFunction={enclosingFn}
            query={query}
            metadata={metadata}
            reportTimezone={reportTimezone}
          />
          <Completions
            completions={options}
            selectedCompletion={selectedOption}
            onCompletionClick={handleCompletionClick}
            query={query}
            stageIndex={stageIndex}
          />
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

function useCompletions(state: EditorState) {
  const completions = useMemo(() => {
    return {
      status: completionStatus(state),
      options: (currentCompletions(state) ?? []) as readonly Completion[],
      selectedOption: selectedCompletionIndex(state),
    };
  }, [state]);

  const prevCompletions = usePrevious(completions) ?? completions;

  // when pending render the previous completions to avoid flickering
  return completions.status === "pending" ? prevCompletions : completions;
}

function Completions({
  completions,
  selectedCompletion,
  onCompletionClick,
  query,
  stageIndex,
}: {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  onCompletionClick: (index: number) => void;
  query: Lib.Query;
  stageIndex: number;
}) {
  if (completions.length <= 0) {
    return null;
  }

  return (
    <>
      <ul role="listbox" className={S.listbox}>
        <DelayGroup>
          {completions.map((completion, index) => (
            <CompletionItem
              key={completion.displayLabel}
              completion={completion}
              index={index}
              selected={selectedCompletion === index}
              onCompletionClick={onCompletionClick}
              query={query}
              stageIndex={stageIndex}
            />
          ))}
        </DelayGroup>
      </ul>
      <Footer />
    </>
  );
}

function CompletionItem({
  completion,
  selected,
  onCompletionClick,
  index,
  query,
  stageIndex,
}: {
  completion: Completion;
  index: number;
  onCompletionClick: (index: number) => void;
  selected: boolean;
  query: Lib.Query;
  stageIndex: number;
}) {
  const ref = useRef<HTMLLIElement>(null);
  const handleMouseDown = useCallback(
    (evt: React.MouseEvent<HTMLLIElement>) => {
      evt.preventDefault();
      onCompletionClick(index);
    },
    [index, onCompletionClick],
  );

  useEffect(() => {
    if (!selected || !ref.current) {
      return;
    }

    ref.current.scrollIntoView({
      block: "nearest",
    });
  }, [selected]);

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseDown={handleMouseDown}
      className={S.item}
    >
      {completion.column && (
        <QueryColumnInfoIcon
          query={query}
          stageIndex={stageIndex}
          column={completion.column}
          position="top"
          className={S.icon}
        />
      )}
      {!completion.column && <Icon name={completion.icon} className={S.icon} />}
      <MatchText
        text={completion.displayLabel ?? completion.label}
        ranges={completion.matches}
      />
    </li>
  );
}

function MatchText({
  text,
  ranges = [],
}: {
  text: string;
  ranges?: [number, number][];
}) {
  const res = [];
  let prevIndex = 0;

  for (const range of ranges) {
    if (range[0] >= 0) {
      res.push(text.slice(prevIndex, range[0]));
    }
    res.push(
      <span className={S.highlight}>
        {text.slice(Math.max(0, range[0]), range[1] + 1)}
      </span>,
    );
    prevIndex = range[1] + 1;
  }
  res.push(text.slice(prevIndex, text.length));

  return <span className={S.label}>{res}</span>;
}

function Footer() {
  return (
    <Box className={S.footer}>
      <Icon name="arrow_up" className={S.key} />
      <Icon name="arrow_down" className={S.key} />
      to navigate.
      <span />
      <Icon name="enter_or_return" className={S.key} /> to select.
    </Box>
  );
}
