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
import type * as Lib from "metabase-lib";
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
  className,
}: {
  state: EditorState;
  view: EditorView;
  query: Lib.Query;
  stageIndex: number;
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
    <ul role="listbox" className={cx(S.listbox, className)}>
      <DelayGroup>
        {options.map((completion, index) => (
          <Fragment key={completion.displayLabel ?? completion.label}>
            {completion.heading != null && (
              <li role="presentation" className={S.section}>
                {completion.heading}
              </li>
            )}
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
          </Fragment>
        ))}
      </DelayGroup>
    </ul>
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

  const description = getDescription(completion, { database, reportTimezone });

  return (
    <li
      ref={ref}
      role="option"
      aria-selected={selected}
      onMouseDown={handleMouseDown}
      className={S.item}
    >
      <span className={cx(S.name, { [S.withDescription]: description })}>
        {completion.column ? (
          <QueryColumnInfoIcon
            query={query}
            stageIndex={stageIndex}
            column={completion.column}
            position="top"
            className={S.icon}
          />
        ) : (
          <CompletionIcon completion={completion} />
        )}
        <span className={S.label}>
          <MatchText
            text={completion.displayLabel ?? completion.label}
            ranges={completion.matches}
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
    return <FunctionIcon className={S.icon} aria-hidden />;
  }
  return <Icon name={completion.icon} className={S.icon} />;
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
