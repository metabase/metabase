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

import { Box, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import { HelpText } from "../HelpText";
import type { Completion } from "../types";
import { enclosingFunction } from "../util";

import S from "./Tooltip.module.css";

export function Tooltip({
  query,
  metadata,
  reportTimezone,

  state,
  view,
}: {
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;

  // from tooltip extension
  state: EditorState;
  view: EditorView;
}) {
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

  const enclosingFn = enclosingFunction(
    state.doc.toString(),
    state.selection.main.head,
  );

  return (
    <Box
      className={S.tooltip}
      data-testid="custom-expression-editor-suggestions"
    >
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
      />
    </Box>
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
}: {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  onCompletionClick: (index: number) => void;
}) {
  if (completions.length <= 0) {
    return null;
  }

  return (
    <>
      <ul role="listbox" className={S.listbox}>
        {completions.map((completion, index) => (
          <CompletionItem
            key={index}
            completion={completion}
            index={index}
            selected={selectedCompletion === index}
            onCompletionClick={onCompletionClick}
          />
        ))}
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
}: {
  completion: Completion;
  index: number;
  onCompletionClick: (index: number) => void;
  selected: boolean;
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
      <Icon name={completion.icon} className={S.icon} />

      {completion.displayLabel ?? completion.label}
    </li>
  );
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
