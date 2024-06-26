import type { Ace } from "ace-builds";
import * as ace from "ace-builds/src-noconflict/ace";
import type { RefObject } from "react";
import * as React from "react";
import type { ICommand, IMarker } from "react-ace";
import AceEditor from "react-ace";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import { getColumnIcon } from "metabase/common/utils/columns";
import ExplicitSize from "metabase/components/ExplicitSize";
import { getMetadata } from "metabase/selectors/metadata";
import { getShowMetabaseLinks } from "metabase/selectors/whitelabel";
import type { IconName } from "metabase/ui";
import * as Lib from "metabase-lib";
import { isExpression } from "metabase-lib/v1/expressions";
import { diagnose } from "metabase-lib/v1/expressions/diagnostics";
import { format } from "metabase-lib/v1/expressions/format";
import { processSource } from "metabase-lib/v1/expressions/process";
import type {
  GroupName,
  SuggestArgs,
  Suggestion,
} from "metabase-lib/v1/expressions/suggest";
import { suggest } from "metabase-lib/v1/expressions/suggest";
import { tokenize } from "metabase-lib/v1/expressions/tokenizer";
import type {
  ErrorWithMessage,
  HelpText,
} from "metabase-lib/v1/expressions/types";
import type Metadata from "metabase-lib/v1/metadata/Metadata";
import type { Expression } from "metabase-types/api";
import type { State } from "metabase-types/store";

import { ExpressionEditorHelpText } from "../ExpressionEditorHelpText";
import { ExpressionEditorSuggestions } from "../ExpressionEditorSuggestions";
import ExpressionMode from "../ExpressionMode";

import {
  EditorContainer,
  EditorEqualsSign,
  ErrorMessageContainer,
} from "./ExpressionEditorTextfield.styled";

ace.config.set("basePath", "/assets/ui/");
ace.config.set("useStrictCSP", true);

export type SuggestionFooter = {
  footer: true;
  name: string;
  icon: IconName;
  href: string;
};

export type SuggestionShortcut = {
  shortcut: true;
  name: string;
  icon: IconName;
  group: GroupName;
  action: () => void;
};

type SuggestWithExtras = {
  suggestions: (Suggestion | SuggestionFooter | SuggestionShortcut)[];
  helpText?: HelpText;
};

export function suggestWithExtras(
  args: SuggestArgs & {
    showMetabaseLinks: boolean;
    shortcuts?: SuggestionShortcut[];
  },
): SuggestWithExtras {
  const res = suggest(args);

  const suggestions: (Suggestion | SuggestionFooter | SuggestionShortcut)[] =
    res.suggestions ?? [];

  if (args.showMetabaseLinks && args.source === "") {
    suggestions.push(...(args.shortcuts ?? []));

    if (args.startRule === "aggregation") {
      suggestions.push({
        footer: true,
        name: t`Documentation`,
        icon: "external",
        href: "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list#aggregations",
      });
    } else {
      suggestions.push({
        footer: true,
        name: t`Documentation`,
        icon: "external",
        href: "https://www.metabase.com/docs/latest/questions/query-builder/expressions-list#functions",
      });
    }
  }

  return {
    ...res,
    suggestions,
  };
}

const ACE_OPTIONS = {
  behavioursEnabled: false,
  indentedSoftWrap: false,
  minLines: 1,
  maxLines: 9,
  showLineNumbers: false,
  showGutter: false,
  showFoldWidgets: false,
  showPrintMargin: false,
};

interface ExpressionEditorTextfieldProps {
  expression: Expression | undefined;
  clause: Lib.ExpressionClause | undefined;
  name: string;
  query: Lib.Query;
  stageIndex: number;
  metadata: Metadata;
  startRule: "expression" | "aggregation" | "boolean";
  expressionIndex?: number;
  width?: number;
  reportTimezone?: string;
  textAreaId?: string;

  onChange: (
    expression: Expression | null,
    expressionClause: Lib.ExpressionClause | null,
  ) => void;
  onError: (error: ErrorWithMessage | null) => void;
  onBlankChange: (isBlank: boolean) => void;
  onCommit: (
    expression: Expression | null,
    expressionClause: Lib.ExpressionClause | null,
  ) => void;
  helpTextTarget: RefObject<HTMLElement>;
  showMetabaseLinks: boolean;
  shortcuts?: SuggestionShortcut[];
}

interface ExpressionEditorTextfieldState {
  source: string;
  suggestions: (Suggestion | SuggestionFooter | SuggestionShortcut)[];
  highlightedSuggestionIndex: number;
  isFocused: boolean;
  errorMessage: ErrorWithMessage | null;
  helpText: HelpText | null;
  hasChanges: boolean;
}

function transformPropsToState(
  props: ExpressionEditorTextfieldProps,
): ExpressionEditorTextfieldState {
  const {
    expression: legacyExpression = ExpressionEditorTextfield.defaultProps
      .expression,
    startRule = ExpressionEditorTextfield.defaultProps.startRule,
    clause,
    query,
    stageIndex,
    expressionIndex,
    metadata,
    reportTimezone,
    showMetabaseLinks,
    shortcuts = [],
  } = props;
  const expressionFromClause = clause
    ? Lib.legacyExpressionForExpressionClause(query, stageIndex, clause)
    : undefined;
  const expression = expressionFromClause ?? legacyExpression;
  const source = format(expression, {
    startRule,
    stageIndex,
    query,
    expressionIndex,
  });

  const { suggestions = [], helpText = null } = suggestWithExtras({
    reportTimezone,
    startRule,
    source,
    targetOffset: 0,
    expressionIndex,
    query,
    stageIndex,
    metadata,
    getColumnIcon,
    showMetabaseLinks,
    shortcuts,
  });

  return {
    source,
    highlightedSuggestionIndex: 0,
    helpText,
    suggestions,
    isFocused: false,
    errorMessage: null,
    hasChanges: false,
  };
}

const mapStateToProps = (state: State) => ({
  metadata: getMetadata(state),
  showMetabaseLinks: getShowMetabaseLinks(state),
});

const CURSOR_DEBOUNCE_INTERVAL = 10;

class ExpressionEditorTextfield extends React.Component<
  ExpressionEditorTextfieldProps,
  ExpressionEditorTextfieldState
> {
  input = React.createRef<AceEditor>();
  suggestionTarget = React.createRef<HTMLDivElement>();
  helpTextTarget = React.createRef<HTMLDivElement>();
  popupMenuTarget = React.createRef<HTMLUListElement>();

  static defaultProps = {
    expression: "",
    startRule: "expression",
  } as const;

  constructor(props: ExpressionEditorTextfieldProps) {
    super(props);

    this.state = transformPropsToState(props);
  }

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(
    newProps: Readonly<ExpressionEditorTextfieldProps>,
  ) {
    // we only refresh our state if we had no previous state OR if our expression changed
    const {
      expression,
      clause,
      startRule,
      query,
      stageIndex,
      expressionIndex,
    } = newProps;
    const hasLegacyExpressionChanged = !_.isEqual(
      this.props.expression,
      expression,
    );
    const hasClauseChanged = !_.isEqual(this.props.clause, clause);
    const hasExpressionChanged = hasLegacyExpressionChanged || hasClauseChanged;
    const expressionFromClause = clause
      ? Lib.legacyExpressionForExpressionClause(query, stageIndex, clause)
      : undefined;
    const newExpression = expressionFromClause ?? expression;

    if (!this.state || hasExpressionChanged) {
      const source = format(newExpression, {
        startRule,
        stageIndex,
        query,
        expressionIndex,
      });
      const currentSource = this.state.source;
      this.setState(transformPropsToState(newProps));

      // Reset caret position due to reformatting
      if (currentSource !== source && this.input.current) {
        const { editor } = this.input.current;
        setTimeout(() => editor.gotoLine(1, source.length, false), 0);
      }
    }
  }

  handleKeypress = (evt: KeyboardEvent) => {
    if (evt.key !== "Enter") {
      return;
    }

    evt.preventDefault();
    evt.stopPropagation();
    this.handleEnter();
  };

  textarea() {
    return this.input.current?.refEditor?.getElementsByTagName("textarea")[0];
  }

  componentDidMount() {
    if (this.input.current) {
      const { editor } = this.input.current;
      // "ExpressionMode" constructor is not typed, so cast it here explicitly
      const mode = new ExpressionMode() as unknown as Ace.SyntaxMode;

      // HACK: manually register the keypress event for the enter key,
      // since ACE does not seem to call the event handlers in time for
      // them to do certain things, like window.open.
      //
      // Without this hack, popups get blocked since they are not
      // considered by the browser to be in response to a user action.
      this.textarea()?.addEventListener("keypress", this.handleKeypress);

      editor.getSession().setMode(mode);

      editor.setOptions({
        fontFamily: "Monaco, monospace",
        fontSize: "12px",
      });

      const passKeysToBrowser = editor.commands.byName.passKeysToBrowser;
      editor.commands.bindKey("Tab", passKeysToBrowser);
      editor.commands.bindKey("Shift-Tab", passKeysToBrowser);
      editor.commands.removeCommand(editor.commands.byName.indent);
      editor.commands.removeCommand(editor.commands.byName.outdent);

      if (this.state.source.length === 0) {
        setTimeout(() => this.triggerAutosuggest());
      }

      this.triggerAutosuggest();
    }
  }

  componentDidUpdate() {
    const { textAreaId } = this.props;
    if (this.input.current && textAreaId) {
      const textArea = this.input.current.editor.textInput.getElement?.();
      textArea?.setAttribute?.("id", textAreaId);
    }
  }

  componentWillUnmount() {
    this.textarea()?.removeEventListener("keypress", this.handleKeypress);
  }

  onSuggestionSelected = (index: number) => {
    const { source, suggestions } = this.state;
    const suggestion = suggestions && suggestions[index];

    if ("footer" in suggestion) {
      // open link in new window
      window.open(suggestion.href, "_blank");
      return;
    }

    if ("shortcut" in suggestion) {
      // run the shortcut
      suggestion.action();
      return;
    }

    if (this.input.current && suggestion) {
      const { editor } = this.input.current;
      const { tokens } = tokenize(source);
      const token = tokens.find(t => t.end >= suggestion.index);

      const { row } = editor.getCursorPosition();

      if (token) {
        const prefix = source.slice(0, token.start);
        const postfix = source.slice(token.end);
        const suggested = suggestion.text;

        // e.g. source is "isnull(A" and suggested is "isempty("
        // the result should be "isempty(A" and NOT "isempty((A"
        const openParen = _.last(suggested) === "(";
        const alreadyOpenParen = _.first(postfix.trimLeft()) === "(";
        const extraTrim = openParen && alreadyOpenParen ? 1 : 0;
        const replacement = suggested.slice(0, suggested.length - extraTrim);

        const updatedExpression = prefix + replacement + postfix;
        this.handleExpressionChange(updatedExpression);
        const caretPos = updatedExpression.length - postfix.length;

        // setTimeout solves a race condition that happens only
        // when a suggestion has been selected by
        // clicking on the autocomplete
        setTimeout(() => editor.moveCursorTo(row, caretPos));
      } else {
        const updatedExpression = source + suggestion.text;
        this.handleExpressionChange(updatedExpression);
        const caretPos = updatedExpression.length;
        setTimeout(() => editor.moveCursorTo(row, caretPos));
      }
    }
  };

  handleArrowUp = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;

    if (suggestions.length) {
      this.setState({
        highlightedSuggestionIndex:
          (highlightedSuggestionIndex + suggestions.length - 1) %
          suggestions.length,
      });
    } else {
      this.input.current?.editor.navigateLineEnd();
    }
  };

  handleArrowDown = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;

    if (suggestions.length) {
      this.setState({
        highlightedSuggestionIndex:
          (highlightedSuggestionIndex + suggestions.length + 1) %
          suggestions.length,
      });
    } else {
      this.input.current?.editor.navigateLineEnd();
    }
  };

  handleEnter = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;

    if (suggestions.length) {
      this.onSuggestionSelected(highlightedSuggestionIndex);
    } else {
      this.commitExpression();
    }
  };

  handleHighlightSuggestion = (index: number) => {
    this.setState({
      highlightedSuggestionIndex: index,
    });
  };

  chooseSuggestion = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;

    if (suggestions.length) {
      this.onSuggestionSelected(highlightedSuggestionIndex);
    }
  };

  handleFocus = () => {
    this.setState({ isFocused: true });
    if (this.input.current) {
      const { editor } = this.input.current;
      this.handleCursorChange(editor.selection);

      // workaround some unknown issue on Firefox
      // without explicit focus, the editor is vertically shifted
      setTimeout(() => {
        editor.focus();
      }, 0);
    }
  };

  handleInputBlur = (e: React.FocusEvent) => {
    // Ensure there is no active popup menu before we blur or
    // that user didn't interact with the popup menu
    if (
      this.popupMenuTarget.current &&
      e.relatedTarget?.contains(this.popupMenuTarget.current)
    ) {
      return;
    }

    this.setState({ isFocused: false });

    // Switching to another window also triggers the blur event.
    // When our window gets focus again, the input will automatically
    // get focus, so ignore the blue event to avoid showing an
    // error message when the user is not actually done.
    if (e.target === document.activeElement) {
      return;
    }

    const { onChange, onError } = this.props;

    this.clearSuggestions();

    const errorMessage = this.diagnoseExpression();
    this.setState({ errorMessage });

    // whenever our input blurs we push the updated expression to our parent if valid
    if (errorMessage) {
      onError(errorMessage);
    } else {
      const compiledExpression = this.compileExpression();

      if (compiledExpression) {
        const { expression, expressionClause } = compiledExpression;

        if (!isExpression(expression)) {
          console.warn("isExpression=false", expression);
        }

        onChange(expression, expressionClause);
      } else {
        onError({ message: t`Invalid expression` });
      }
    }
  };

  clearSuggestions() {
    this.setState({
      highlightedSuggestionIndex: 0,
      helpText: null,
    });
    this.updateSuggestions([]);
  }

  updateSuggestions(
    suggestions:
      | (Suggestion | SuggestionFooter | SuggestionShortcut)[]
      | undefined = [],
  ) {
    this.setState({ suggestions });

    // Correctly bind Tab depending on whether suggestions are available or not
    if (this.input.current) {
      const { editor } = this.input.current;
      const { suggestions } = this.state;
      const tabBinding = editor.commands.commandKeyBinding.tab;
      if (suggestions.length > 0) {
        // Something to suggest? Tab is for choosing one of them
        editor.commands.bindKey("Tab", editor.commands.byName.chooseSuggestion);
      } else {
        if (Array.isArray(tabBinding) && tabBinding.length > 1) {
          // No more suggestions? Keep a single binding and remove the
          // second one (added to choose a suggestion)
          editor.commands.commandKeyBinding.tab = tabBinding.shift();
        }
      }
    }
  }

  compileExpression() {
    const { source } = this.state;
    const { query, stageIndex, startRule, name, expressionIndex } = this.props;
    if (!source || source.length === 0) {
      return null;
    }
    const { expression, expressionClause } = processSource({
      name,
      source,
      query,
      stageIndex,
      startRule,
      expressionIndex,
    });

    return { expression, expressionClause };
  }

  diagnoseExpression(): ErrorWithMessage | null {
    const { source } = this.state;
    const {
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
      name,
      query,
      stageIndex,
      expressionIndex,
      metadata,
    } = this.props;

    if (!source || source.length === 0) {
      return { message: t`Empty expression` };
    }

    return diagnose({
      source,
      startRule,
      name,
      query,
      stageIndex,
      expressionIndex,
      metadata,
    });
  }

  commitExpression() {
    const {
      query,
      stageIndex,
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
      onCommit,
      onError,
      expressionIndex,
    } = this.props;
    const { source } = this.state;

    const errorMessage = diagnose({
      source,
      startRule,
      query,
      stageIndex,
      expressionIndex,
    });

    this.setState({ errorMessage });

    if (errorMessage) {
      onError(errorMessage);
    } else {
      const compiledExpression = this.compileExpression();

      if (compiledExpression) {
        const { expression, expressionClause } = compiledExpression;

        if (isExpression(expression)) {
          onCommit(expression, expressionClause);
        }
      } else {
        onError({ message: t`Invalid expression` });
      }
    }
  }

  triggerAutosuggest = () => {
    this.handleExpressionChange(this.state.source);
  };

  handleExpressionChange = (source: string) => {
    if (source) {
      this.setState({ hasChanges: true });
    }

    this.setState({ source, errorMessage: null });
    if (this.props.onBlankChange) {
      this.props.onBlankChange(source.length === 0);
    }
  };

  handleCursorChange = _.debounce((selection: Ace.Selection) => {
    const cursor = selection.getCursor();

    const {
      query,
      reportTimezone,
      stageIndex,
      metadata,
      expressionIndex,
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
      showMetabaseLinks,
      shortcuts = [],
    } = this.props;
    const { source } = this.state;
    const { suggestions, helpText } = suggestWithExtras({
      reportTimezone,
      startRule,
      source,
      targetOffset: cursor.column,
      expressionIndex,
      query,
      stageIndex,
      metadata,
      getColumnIcon,
      showMetabaseLinks,
      shortcuts,
    });

    this.setState({ helpText: helpText || null });
    if (this.state.isFocused) {
      this.updateSuggestions(suggestions);
    }
  }, CURSOR_DEBOUNCE_INTERVAL);

  errorAsMarkers(errorMessage: ErrorWithMessage | null = null): IMarker[] {
    if (errorMessage) {
      const { pos, len } = errorMessage;
      // Because not every error message offers location info (yet)
      if (typeof pos === "number" && typeof len === "number") {
        return [
          {
            startRow: 0,
            startCol: pos,
            endRow: 0,
            endCol: pos + len,
            className: "error",
            type: "text",
          },
        ];
      }
    }
    return [];
  }

  commands: ICommand[] = [
    // Note: Enter is handled manually (see componentDidMount)
    {
      name: "arrowDown",
      bindKey: { win: "Down", mac: "Down" },
      exec: () => {
        this.handleArrowDown();
      },
    },
    {
      name: "arrowUp",
      bindKey: { win: "Up", mac: "Up" },
      exec: () => {
        this.handleArrowUp();
      },
    },
    {
      name: "chooseSuggestion",
      // @ts-expect-error Based on typings null is not a valid value, but bindKey is assigned dynamically if there are suggestions available.
      bindKey: null,
      exec: () => {
        this.chooseSuggestion();
      },
    },
    {
      name: "clearSuggestions",
      bindKey: { win: "Esc", mac: "Esc" },
      exec: () => {
        this.clearSuggestions();
      },
    },
  ];

  render() {
    const { width, query, stageIndex } = this.props;
    const {
      source,
      suggestions,
      errorMessage,
      hasChanges,
      isFocused,
      highlightedSuggestionIndex,
      helpText,
    } = this.state;

    return (
      <div ref={this.helpTextTarget}>
        <ExpressionEditorSuggestions
          query={query}
          stageIndex={stageIndex}
          suggestions={suggestions}
          onSuggestionMouseDown={this.onSuggestionSelected}
          highlightedIndex={highlightedSuggestionIndex}
          onHighlightSuggestion={this.handleHighlightSuggestion}
          open={isFocused}
          ref={this.popupMenuTarget}
        >
          <EditorContainer
            isFocused={isFocused}
            hasError={Boolean(errorMessage)}
            ref={this.suggestionTarget}
            data-testid="expression-editor-textfield"
          >
            <EditorEqualsSign>=</EditorEqualsSign>
            <AceEditor
              commands={this.commands}
              mode="text"
              ref={this.input}
              value={source}
              markers={this.errorAsMarkers(errorMessage)}
              focus={true}
              highlightActiveLine={false}
              wrapEnabled={true}
              fontSize={12}
              onBlur={this.handleInputBlur}
              onFocus={this.handleFocus}
              setOptions={ACE_OPTIONS}
              onChange={this.handleExpressionChange}
              onCursorChange={this.handleCursorChange}
              width="100%"
            />
          </EditorContainer>
        </ExpressionEditorSuggestions>
        {errorMessage && hasChanges && (
          <ErrorMessageContainer>{errorMessage.message}</ErrorMessageContainer>
        )}
        <ExpressionEditorHelpText
          target={this.helpTextTarget}
          helpText={helpText}
          width={width}
        />
      </div>
    );
  }
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  ExplicitSize(),
  connect(mapStateToProps),
)(ExpressionEditorTextfield);
