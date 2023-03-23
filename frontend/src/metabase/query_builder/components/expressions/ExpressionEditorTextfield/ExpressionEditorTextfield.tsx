import React, { RefObject } from "react";
import { t } from "ttag";
import _ from "underscore";
import AceEditor, { ICommand, IMarker } from "react-ace";
import * as ace from "ace-builds/src-noconflict/ace";
import { Ace } from "ace-builds";
import ExplicitSize from "metabase/components/ExplicitSize";
import type { Expression } from "metabase-types/types/Query";
import { format } from "metabase-lib/expressions/format";
import { processSource } from "metabase-lib/expressions/process";
import { diagnose } from "metabase-lib/expressions/diagnostics";
import { tokenize } from "metabase-lib/expressions/tokenizer";
import { isExpression } from "metabase-lib/expressions";
import type { HelpText } from "metabase-lib/expressions/types";
import StructuredQuery from "metabase-lib/queries/StructuredQuery";

import ExpressionEditorHelpText from "../ExpressionEditorHelpText";
import ExpressionEditorSuggestions from "../ExpressionEditorSuggestions";
import ExpressionMode from "../ExpressionMode";
import { suggest, Suggestion } from "./suggest";
import {
  EditorContainer,
  EditorEqualsSign,
  ErrorMessageContainer,
} from "./ExpressionEditorTextfield.styled";

ace.config.set("basePath", "/assets/ui/");

type ErrorWithMessage = { message: string; pos?: number; len?: number };

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
  name: string;
  query: StructuredQuery;
  startRule?: string;
  width?: number;
  reportTimezone?: string;

  onChange: (expression: Expression | null) => void;
  onError: (error: ErrorWithMessage | null) => void;
  onBlankChange: (isBlank: boolean) => void;
  onCommit: (expression: Expression | null) => void;
  helpTextTarget: RefObject<HTMLElement>;
}

interface ExpressionEditorTextfieldState {
  source: string;
  expression: Expression;
  suggestions: Suggestion[];
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
    expression = ExpressionEditorTextfield.defaultProps.expression,
    query,
    startRule = ExpressionEditorTextfield.defaultProps.startRule,
  } = props;
  const source = format(expression, { query, startRule });

  return {
    source,
    expression,
    highlightedSuggestionIndex: 0,
    helpText: null,
    suggestions: [],
    isFocused: false,
    errorMessage: null,
    hasChanges: false,
  };
}

class ExpressionEditorTextfield extends React.Component<
  ExpressionEditorTextfieldProps,
  ExpressionEditorTextfieldState
> {
  input = React.createRef<AceEditor>();
  suggestionTarget = React.createRef<HTMLDivElement>();

  static defaultProps = {
    expression: "",
    startRule: "expression",
  };

  state: ExpressionEditorTextfieldState;

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
    const { expression, query, startRule } = newProps;
    if (!this.state || !_.isEqual(this.props.expression, expression)) {
      const source = format(expression, { query, startRule });
      const currentSource = this.state.source;
      this.setState(transformPropsToState(newProps));

      // Reset caret position due to reformatting
      if (currentSource !== source && this.input.current) {
        const { editor } = this.input.current;
        setTimeout(() => editor.gotoLine(1, source.length, false), 0);
      }
    }
  }

  componentDidMount() {
    if (this.input.current) {
      const { editor } = this.input.current;
      // "ExpressionMode" constructor is not typed, so cast it here explicitly
      const mode = new ExpressionMode() as unknown as Ace.SyntaxMode;

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

  onSuggestionSelected = (index: number) => {
    const { source, suggestions } = this.state;
    const suggestion = suggestions && suggestions[index];

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
        const newExpression = source + suggestion.text;
        this.handleExpressionChange(newExpression);
        editor.moveCursorTo(row, newExpression.length);
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
    this.setState({ isFocused: false });

    // Switching to another window also triggers the blur event.
    // When our window gets focus again, the input will automatically
    // get focus, so ignore the blue event to avoid showing an
    // error message when the user is not actually done.
    if (e.target === document.activeElement) {
      return;
    }

    this.clearSuggestions();

    const errorMessage = this.diagnoseExpression();
    this.setState({ errorMessage });

    // whenever our input blurs we push the updated expression to our parent if valid
    if (errorMessage) {
      this.props.onError(errorMessage);
    } else {
      const expression = this.compileExpression();
      if (expression) {
        if (!isExpression(expression)) {
          console.warn("isExpression=false", expression);
        }
        this.props.onChange(expression);
      } else {
        this.props.onError({ message: t`Invalid expression` });
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

  updateSuggestions(suggestions: Suggestion[] | undefined = []) {
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
    const { query, startRule, name } = this.props;
    if (!source || source.length === 0) {
      return null;
    }
    const { expression } = processSource({ name, source, query, startRule });

    return expression;
  }

  diagnoseExpression(): ErrorWithMessage | null {
    const { source } = this.state;
    const {
      query,
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
      name,
    } = this.props;
    if (!source || source.length === 0) {
      return { message: t`Empty expression` };
    }
    return diagnose(source, startRule, query, name);
  }

  commitExpression() {
    const {
      query,
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
    } = this.props;
    const { source } = this.state;
    const errorMessage = diagnose(
      source,
      startRule,
      query,
    ) as ErrorWithMessage | null;
    this.setState({ errorMessage });

    if (errorMessage) {
      this.props.onError(errorMessage);
    } else {
      const expression = this.compileExpression();

      if (isExpression(expression)) {
        this.props.onCommit(expression);
      }
    }
  }

  triggerAutosuggest = () => {
    this.handleExpressionChange(this.state.source);
  };

  handleExpressionChange(source: string) {
    if (source) {
      this.setState({ hasChanges: true });
    }

    this.setState({ source, errorMessage: null });
    if (this.props.onBlankChange) {
      this.props.onBlankChange(source.length === 0);
    }
  }

  handleCursorChange(selection: Ace.Selection) {
    const cursor = selection.getCursor();

    const {
      query,
      reportTimezone,
      startRule = ExpressionEditorTextfield.defaultProps.startRule,
    } = this.props;
    const { source } = this.state;
    const { suggestions, helpText } = suggest({
      query,
      reportTimezone,
      startRule,
      source,
      targetOffset: cursor.column,
    });

    this.setState({ helpText: helpText || null });
    this.updateSuggestions(suggestions);
  }

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
      name: "enter",
      bindKey: { win: "Enter", mac: "Enter" },
      exec: () => {
        this.handleEnter();
      },
    },
    {
      name: "chooseSuggestion",
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore // Based on typings null is not a valid value, but bindKey is assigned dynamically if there are suggestions available.
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
    const { source, suggestions, errorMessage, hasChanges, isFocused } =
      this.state;

    return (
      <React.Fragment>
        <EditorContainer
          isFocused={isFocused}
          hasError={Boolean(errorMessage)}
          ref={this.suggestionTarget}
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
            onChange={source => this.handleExpressionChange(source)}
            onCursorChange={selection => this.handleCursorChange(selection)}
            width="100%"
          />
          <ExpressionEditorSuggestions
            target={this.suggestionTarget.current}
            suggestions={suggestions}
            onSuggestionMouseDown={this.onSuggestionSelected}
            highlightedIndex={this.state.highlightedSuggestionIndex}
          />
        </EditorContainer>
        {errorMessage && hasChanges && (
          <ErrorMessageContainer>{errorMessage.message}</ErrorMessageContainer>
        )}
        <ExpressionEditorHelpText
          target={this.props.helpTextTarget}
          helpText={this.state.helpText}
          width={this.props.width}
        />
      </React.Fragment>
    );
  }
}

export default ExplicitSize()(ExpressionEditorTextfield);
