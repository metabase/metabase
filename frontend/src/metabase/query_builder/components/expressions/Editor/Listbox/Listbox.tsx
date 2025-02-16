import {
  acceptCompletion,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef } from "react";

import { QueryColumnInfoIcon } from "metabase/components/MetadataInfo/ColumnInfoIcon";
import { Box, DelayGroup, Icon } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { Completion } from "metabase-lib/v1/expressions/complete";

import S from "./Listbox.module.css";
import { MatchText } from "./MatchText";
import { useCompletions } from "./util";

export function Listbox({
  state,
  view,
  query,
  stageIndex,
}: {
  state: EditorState;
  view: EditorView;
  query: Lib.Query;
  stageIndex: number;
}) {
  const { options, selectedOption } = useCompletions(state);

  const onCompletionClick = useCallback(
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

  if (options.length <= 0) {
    return null;
  }

  return (
    <>
      <ul role="listbox" className={S.listbox}>
        <DelayGroup>
          {options.map((completion, index) => (
            <CompletionItem
              key={completion.displayLabel ?? completion.label}
              completion={completion}
              index={index}
              selected={selectedOption === index}
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
