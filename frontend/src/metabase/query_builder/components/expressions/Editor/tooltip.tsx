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
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { t } from "ttag";

import { useDocsUrl } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { Box, Icon } from "metabase/ui";
import * as Lib from "metabase-lib";
import {
  doesFunctionNameExist,
  getHelpDocsUrl,
  getHelpText,
} from "metabase-lib/v1/expressions/helper-text-strings";
import type { HelpText } from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";

import css from "./Editor.module.css";
import { Highlight } from "./Highlight";
import { parser } from "./language";
import { tokenAtPos } from "./suggestions";

// TODO: Toggle help description open/close expand
// TODO: Segments/metrics always shown?
// TODO: highlight currently shown documentation (enclosingFunction)
// TODO: remove bold from non-existing/unsupported functions
// TODO: allow using keys after clicking the popover
// TODO: fix fonts

type State = {
  completions: readonly Completion[];
  selectedCompletion: number | null;
  enclosingFunction: {
    name: string;
    from: number;
    to: number;
  } | null;
  hasFocus?: boolean;
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
    hasFocus: false,
  });

  const element = useMemo(() => {
    const element = document.createElement("div");
    return element;
  }, []);

  const view = useRef<EditorView | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const handleBlur = useCallback(() => {
    setState(state => ({
      ...state,
      hasFocus: false,
    }));
  }, []);

  const extensions = useMemo(
    () => [
      tooltip(element),
      EditorView.domEventHandlers({
        focus() {
          setState(state => ({
            ...state,
            hasFocus: true,
          }));
        },
        blur(evt) {
          evt.preventDefault();
          evt.stopPropagation();

          const el = evt.relatedTarget as HTMLElement | null;
          if (tooltipRef.current === el || tooltipRef.current?.contains(el)) {
            return;
          }
          handleBlur();
        },
      }),
      EditorView.updateListener.of(update => {
        view.current = update.view;
        setState(state => {
          const enclosingFn = enclosingFunction(update.state);
          const status = completionStatus(update.state);

          if (status === "pending") {
            // use the previous completions, if they exist
            return {
              ...state,
              completions: state.completions,
              selectedCompletion: state.selectedCompletion,
              enclosingFunction: enclosingFn,
            };
          }
          return {
            ...state,
            completions: currentCompletions(update.state),
            selectedCompletion: selectedCompletionIndex(update.state),
            enclosingFunction: enclosingFn,
          };
        });
      }),
    ],
    [element, handleBlur],
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
        ref={tooltipRef}
        state={state}
        query={query}
        metadata={metadata}
        reportTimezone={reportTimezone}
        onCompletionClick={handleCompletionClick}
        onBlur={handleBlur}
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
  onBlur: () => void;
};

function getDatabase(query: Lib.Query, metadata: Metadata) {
  const databaseId = Lib.databaseID(query);
  return metadata.database(databaseId);
}

const Tooltip = forwardRef<HTMLDivElement, TooltipProps>(
  function TooltipInner(props, ref) {
    const {
      query,
      metadata,
      reportTimezone,
      state,
      onCompletionClick,
      onBlur,
    } = props;
    const { completions, selectedCompletion, enclosingFunction, hasFocus } =
      state;

    const database = getDatabase(query, metadata);
    const helpText =
      enclosingFunction && database
        ? getHelpText(enclosingFunction.name, database, reportTimezone)
        : null;

    if (!hasFocus) {
      return null;
    }

    if (completions.length === 0 && !helpText) {
      return null;
    }

    return (
      <div className={css.tooltip} ref={ref} onBlur={onBlur} tabIndex={0}>
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
  },
);

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
      role="option"
      aria-selected={selected}
      onMouseDown={handleMouseDown}
      ref={ref}
    >
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

function wrapPlaceholder(name: string) {
  if (name === "…") {
    return name;
  }

  return `⟨${name}⟩`;
}

function Help({ helpText }: { helpText?: HelpText | null }) {
  const [open, setOpen] = useState(true);

  const { url: docsUrl, showMetabaseLinks } = useDocsUrl(
    helpText ? getHelpDocsUrl(helpText) : "",
  );

  const handleMouseDown = useCallback(
    (evt: React.MouseEvent<HTMLDivElement>) => {
      evt.preventDefault();
      setOpen(open => !open);
    },
    [],
  );

  if (!helpText) {
    return null;
  }

  const { description, structure, args, example } = helpText;

  return (
    <Box className={css.helpText}>
      <Box className={css.usage} onMouseDown={handleMouseDown}>
        {structure}
        {args != null && (
          <>
            (
            {args.map(({ name }, index) => (
              <span key={name}>
                <span className={css.arg}>{wrapPlaceholder(name)}</span>
                {index < args.length - 1 && ", "}
              </span>
            ))}
            )
          </>
        )}
      </Box>

      {open && (
        <Box className={css.info}>
          <Box>{description}</Box>

          {args != null && (
            <Box
              className={css.arguments}
              data-testid="expression-helper-popover-arguments"
            >
              {args.map(({ name, description }) => (
                <Fragment key={name}>
                  <Box className={css.arg}>{wrapPlaceholder(name)}</Box>
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

          {showMetabaseLinks && (
            <ExternalLink
              className={css.documentationLink}
              href={docsUrl}
              target="_blank"
            >
              <Icon m="0.25rem 0.5rem" name="reference" size={12} />
              {t`Learn more`}
            </ExternalLink>
          )}
        </Box>
      )}
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
      const value = state.sliceDoc(cursor.from, cursor.to);
      const name = value.replace(/\(.*\)?$/, "");

      if (value.endsWith(")") && cursor.to === pos) {
        // do not show help when cursor is placed after closing )
        break;
      }

      if (doesFunctionNameExist(name)) {
        res = {
          name,
          from: cursor.from,
          to: cursor.to,
        };
      }
    }
  } while (cursor.next());

  return res;
}
