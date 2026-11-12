import {
  acceptCompletion,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import cx from "classnames";
import {
  Fragment,
  type MouseEvent,
  useCallback,
  useEffect,
  useRef,
} from "react";

import { QueryColumnInfoIcon } from "metabase/common/components/MetadataInfo/QueryColumnInfoIcon";
import {
  type ExpressionSuggestion,
  getClauseDefinition,
} from "metabase/querying/expressions";
import { DelayGroup, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { Database } from "metabase-types/api";

import { FUNCTION_ICONS } from "../../ExpressionSidePanel/content";
import { SIDE_PANEL_ICONS } from "../../ExpressionSidePanel/icons";

import S from "./Listbox.module.css";
import { MatchText } from "./MatchText";
import { useCompletions } from "./util";

type DescriptionOptions = {
  database: Pick<Database, "engine" | "features"> | undefined;
  reportTimezone?: string;
};

export function Listbox({
  state,
  view,
  query,
  stageIndex,
  database,
  reportTimezone,
  heading,
  className,
}: {
  state: EditorState;
  view: EditorView;
  query: Lib.Query;
  stageIndex: number;
  /** Shown above the options, like the description of the current argument. */
  heading?: string;
  className?: string;
} & DescriptionOptions) {
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
      {heading && <div className={S.heading}>{heading}</div>}
      <ul role="listbox" className={cx(S.listbox, className)}>
        <DelayGroup>
          {options.map((completion, index) => (
            <Fragment key={completion.displayLabel ?? completion.label}>
              {completion.heading != null && (
                <li role="presentation" className={S.section}>
                  {completion.heading}
                </li>
              )}
              {completion.type === "empty" ? (
                // No column of the type the function takes: nothing to pick.
                <li role="presentation" className={S.empty}>
                  {completion.displayLabel}
                </li>
              ) : (
                <CompletionItem
                  completion={completion}
                  index={index}
                  selected={selectedOption === index}
                  onCompletionClick={onCompletionClick}
                  query={query}
                  stageIndex={stageIndex}
                  database={database}
                  reportTimezone={reportTimezone}
                />
              )}
            </Fragment>
          ))}
        </DelayGroup>
      </ul>
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
  database,
  reportTimezone,
}: {
  completion: ExpressionSuggestion;
  index: number;
  onCompletionClick: (index: number) => void;
  selected: boolean;
  query: Lib.Query;
  stageIndex: number;
} & DescriptionOptions) {
  const ref = useRef<HTMLLIElement>(null);
  const handleMouseDown = useCallback(
    (evt: MouseEvent<HTMLLIElement>) => {
      evt.stopPropagation();
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

  const column =
    completion.column != null
      ? getColumnParts(query, stageIndex, completion, completion.column)
      : null;
  const description =
    column?.source ?? getDescription(completion, { database, reportTimezone });

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseDown={handleMouseDown}
      className={S.item}
    >
      <span
        className={cx(S.name, {
          [S.withDescription]: description,
          [S.columnName]: column != null,
        })}
      >
        {completion.column ? (
          <QueryColumnInfoIcon
            query={query}
            stageIndex={stageIndex}
            column={completion.column}
            position="top"
            className={cx(S.icon, S.columnIcon)}
          />
        ) : (
          <CompletionIcon completion={completion} />
        )}
        <span className={S.label}>
          <MatchText
            text={column?.name ?? completion.displayLabel ?? completion.label}
            ranges={column?.matches ?? completion.matches}
          />
          {completion.clauseName != null && (
            <span className={S.parens}>()</span>
          )}
        </span>
      </span>
      {description && <span className={S.description}>{description}</span>}
      {completion.hint != null && (
        <span className={S.hint}>{completion.hint}</span>
      )}
    </li>
  );
}

function CompletionIcon({ completion }: { completion: ExpressionSuggestion }) {
  if (completion.clauseName != null) {
    const name = completion.displayLabel ?? completion.label;
    const FunctionIcon =
      SIDE_PANEL_ICONS[FUNCTION_ICONS[name] ?? "function-general"];
    return <FunctionIcon className={cx(S.icon, S.functionIcon)} aria-hidden />;
  }
  return <Icon name={completion.icon} className={S.icon} />;
}

const SEPARATOR = " → ";

/**
 * The name of a column without the name of its join or table, which shows
 * on the right, like in "Full Name   Customer".
 */
function getColumnParts(
  query: Lib.Query,
  stageIndex: number,
  completion: ExpressionSuggestion,
  column: Lib.ColumnMetadata,
) {
  const label = completion.displayLabel ?? completion.label;
  const index = label.lastIndexOf(SEPARATOR);
  const name = index >= 0 ? label.slice(index + SEPARATOR.length) : label;
  const source =
    index >= 0
      ? label.slice(0, index)
      : Lib.displayInfo(query, stageIndex, column).table?.displayName;
  // The matches are in the full label.
  const offset = label.length - name.length;
  const matches = completion.matches?.flatMap(
    ([from, to]): [number, number][] =>
      to < offset ? [] : [[Math.max(0, from - offset), to - offset]],
  );
  return { name, source, matches };
}

/** The first sentence of a function's description, as plain text. */
function getDescription(
  completion: ExpressionSuggestion,
  { database, reportTimezone }: DescriptionOptions,
) {
  const clause =
    completion.clauseName != null
      ? getClauseDefinition(completion.clauseName)
      : undefined;
  const description = clause?.description?.(database ?? {}, reportTimezone);
  return description
    ?.split(/(?<=\.)\s/)[0]
    .replace(/[`$]/g, "")
    .trim();
}
