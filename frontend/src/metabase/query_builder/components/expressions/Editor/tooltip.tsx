import {
  type Completion,
  acceptCompletion,
  completionStatus,
  currentCompletions,
  selectedCompletionIndex,
  setSelectedCompletion,
} from "@codemirror/autocomplete";
import {
  type EditorState,
  type Extension,
  StateField,
} from "@codemirror/state";
import { EditorView, type Tooltip, showTooltip } from "@codemirror/view";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import {
  doesFunctionNameExist,
  getHelpText,
} from "metabase-lib/v1/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import css from "./Editor.module.css";
import { Highlight } from "./Highlight";
import { parser } from "./language";
import { tokenAtPos } from "./suggestions";

// TODO: Close tooltip on focus
// TODO: Toggle help description open/close expand
// TODO: Segments/metrics always shown?
// TODO: Hide help text when cursor is after the function

type State = {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  enclosingFunction: {
    name: string;
    from: number;
    to: number;
  } | null;
};

type TooltipOptions = {
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
};

/**
 * Set up a custom tooltip that renders content with React but uses the CodeMirror
 * suggestions.
 *
 * Note: this is a bit hacky, but there is currently no other way to render custom
 * tooltips with suggestions in CodeMirror.
 */
export function useTooltip({
  query,
  metadata,
  reportTimezone,
}: TooltipOptions): [Extension[], React.ReactNode] {
  const [state, setState] = useState<State>({
    completions: [],
    selectedCompletion: null,
    enclosingFunction: null,
  });

  const element = useMemo(() => {
    const element = document.createElement("div");
    return element;
  }, []);

  const view = useRef<EditorView | null>(null);

  const extensions = useMemo(
    () => [
      tooltip(element),
      EditorView.updateListener.of(update => {
        view.current = update.view;
        setState(state => {
          const enclosingFn = enclosingFunction(update.state);

          const status = completionStatus(update.state);
          if (status === "pending") {
            // use the previous completions, if they exist
            return {
              focus: update.view.hasFocus,
              completions: state.completions,
              selectedCompletion: state.selectedCompletion,
              enclosingFunction: enclosingFn,
            };
          }
          return {
            focus: update.view.hasFocus,
            completions: currentCompletions(update.state),
            selectedCompletion: selectedCompletionIndex(update.state),
            enclosingFunction: enclosingFn,
          };
        });
      }),
    ],
    [element],
  );

  const handleCompletionClick = useCallback((index: number) => {
    if (!view.current) {
      return;
    }

    view.current.dispatch({
      effects: [setSelectedCompletion(index)],
    });
    acceptCompletion(view.current);
  }, []);

  return [
    extensions,
    createPortal(
      <Tooltip
        state={state}
        query={query}
        metadata={metadata}
        reportTimezone={reportTimezone}
        onCompletionClick={handleCompletionClick}
      />,
      element,
    ),
  ];
}

export function tooltip(element: HTMLElement) {
  function getPosition(state: EditorState) {
    const pos = state.selection.main.head;
    const source = state.doc.toString();
    const token = tokenAtPos(source, pos);

    return token?.start ?? pos;
  }

  function create() {
    const dom = document.createElement("div");
    dom.append(element);
    return { dom, offset: { x: 0, y: 5 } };
  }

  function getCursorTooltips(state: EditorState): readonly Tooltip[] {
    return [
      {
        pos: getPosition(state),
        above: false,
        strictSide: true,
        arrow: false,
        create,
      },
    ];
  }

  return StateField.define<readonly Tooltip[]>({
    create: getCursorTooltips,
    update(_, transaction) {
      return getCursorTooltips(transaction.state);
    },
    provide: f => showTooltip.computeN([f], state => state.field(f)),
  });
}

type TooltipProps = {
  state: State;
  query: Lib.Query;
  metadata: Metadata;
  reportTimezone?: string;
  onCompletionClick: (index: number) => void;
};

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

export function Tooltip(props: TooltipProps) {
  const { query, metadata, reportTimezone, state, onCompletionClick } = props;
  const { completions, selectedCompletion, enclosingFunction } = state;

  const database = getDatabase(query, metadata);
  const helpText =
    enclosingFunction && database
      ? getHelpText(enclosingFunction.name, database, reportTimezone)
      : null;

  if (completions.length === 0 && !helpText) {
    return null;
  }

  // TODO: allow using keys after clicking the popover

  return (
    <div className={css.tooltip}>
      <Help helpText={helpText} />
      {completions.length > 0 && (
        <>
          <ul role="listbox">
            {completions.map((completion, index) => (
              <CompletionItem
                completion={completion}
                index={index}
                key={index}
                selected={selectedCompletion === index}
                onCompletionClick={onCompletionClick}
              />
            ))}
          </ul>
          <Footer />
        </>
      )}
    </div>
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
  const handleClick = useCallback(
    () => onCompletionClick(index),
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
    <li role="option" aria-selected={selected} onClick={handleClick} ref={ref}>
      <Icon name={completion.icon} className={css.icon} />

      {completion.displayLabel ?? completion.label}
    </li>
  );
}

function Footer() {
  return (
    <Box className={css.footer}>
      <Icon name="arrow_up" className={css.key} />
      <Icon name="arrow_down" className={css.key} />
      to navigate.
      <span />
      <Icon name="enter_or_return" className={css.key} /> to select.
    </Box>
  );
}

function Help({ helpText }: { helpText?: HelpText | null }) {
  if (!helpText) {
    return null;
  }

  const { description, structure, args, example } = helpText;

  // TODO: add link to docs

  return (
    <Box className={css.helpText}>
      <Box className={css.usage}>
        {structure}
        {args != null && (
          <>
            (
            {args.map(({ name }, index) => (
              <span key={name}>
                <span className={css.arg}>
                  {"<"}
                  {name}
                  {">"}
                </span>
                {index < args.length - 1 && ", "}
              </span>
            ))}
            )
          </>
        )}
      </Box>

      <Box className={css.info}>
        <Box>{description}</Box>

        {args != null && (
          <Box
            className={css.arguments}
            data-testid="expression-helper-popover-arguments"
          >
            {args.map(({ name, description }) => (
              <Fragment key={name}>
                <Box className={css.arg}>{name}</Box>
                <Box>{description}</Box>
              </Fragment>
            ))}
          </Box>
        )}

        {example && (
          <>
            <Box className={css.title}>{t`Example`}</Box>
            <Box className={css.example}>
              <Highlight expression={example} />
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
}

function enclosingFunction(state: EditorState) {
  const tree = parser.parse(state.doc.toString());
  const pos = state.selection.main.head;

  const cursor = tree.cursor();
  let res = null;

  do {
    if (
      cursor.name === "CallExpression" &&
      cursor.from <= pos &&
      cursor.to >= pos
    ) {
      const value = state
        .sliceDoc(cursor.from, cursor.to)
        .replace(/\(.*\)?$/, "");

      if (doesFunctionNameExist(value)) {
        res = {
          name: value,
          from: cursor.from,
          to: cursor.to,
        };
      }
    }
  } while (cursor.next());

  return res;
}
