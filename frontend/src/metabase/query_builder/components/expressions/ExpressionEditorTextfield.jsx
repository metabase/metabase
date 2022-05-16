/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import _ from "underscore";
import AceEditor from "react-ace";

import { format } from "metabase/lib/expressions/format";
import { suggest } from "metabase/lib/expressions/suggest";
import { processSource } from "metabase/lib/expressions/process";
import { diagnose } from "metabase/lib/expressions/diagnostics";
import { tokenize } from "metabase/lib/expressions/tokenizer";

import ExplicitSize from "metabase/components/ExplicitSize";

import { isExpression } from "metabase/lib/expressions";

import HelpText from "./ExpressionEditorHelpText";
import ExpressionEditorSuggestions from "./ExpressionEditorSuggestions";
import {
  EditorContainer,
  EditorEqualsSign,
} from "./ExpressionEditorTextfield.styled";

import ExpressionMode from "./ExpressionMode";

import "./expressions.css";

import * as ace from "ace-builds/src-noconflict/ace";

ace.config.set("basePath", "/assets/ui/");

const ErrorMessage = ({ error }) => {
  return (
    <div>
      {error && (
        <div className="text-error mt1 mb1" style={{ whiteSpace: "pre-wrap" }}>
          {error.message}
        </div>
      )}
    </div>
  );
};

class ExpressionEditorTextfield extends React.Component {
  constructor() {
    super();
    this.input = React.createRef();
    this.suggestionTarget = React.createRef();
  }

  static propTypes = {
    expression: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.number,
      PropTypes.array,
    ]),
    name: PropTypes.string,
    onChange: PropTypes.func.isRequired,
    onError: PropTypes.func.isRequired,
    startRule: PropTypes.string.isRequired,
    onBlankChange: PropTypes.func,
    helpTextTarget: PropTypes.instanceOf(Element).isRequired,
  };

  static defaultProps = {
    expression: [null, ""],
    startRule: "expression",
    placeholder: "write some math!",
  };

  state = null;

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    // we only refresh our state if we had no previous state OR if our expression changed
    const { expression, query, startRule } = newProps;
    if (!this.state || !_.isEqual(this.props.expression, expression)) {
      const source = format(expression, { query, startRule });
      const currentSource = this.state?.source;
      this.setState({ source, expression });
      this.clearSuggestions();

      // Reset caret position due to reformatting
      if (currentSource !== source && this.input.current) {
        const { editor } = this.input.current;
        setTimeout(() => editor.gotoLine(1, source.length), 0);
      }
    }
  }

  componentDidMount() {
    const { editor } = this.input.current;
    editor.getSession().setMode(new ExpressionMode());

    editor.setOptions({
      fontFamily: "Monaco, monospace",
      fontSize: "12px",
    });

    const passKeysToBrowser = editor.commands.byName.passKeysToBrowser;
    editor.commands.bindKey("Tab", passKeysToBrowser);
    editor.commands.bindKey("Shift-Tab", passKeysToBrowser);
    editor.commands.removeCommand(editor.commands.byName.indent);
    editor.commands.removeCommand(editor.commands.byName.outdent);

    this.setCaretPosition(
      this.state.source.length,
      this.state.source.length === 0,
    );

    this.triggerAutosuggest();
  }

  onSuggestionSelected = index => {
    const { source, suggestions } = this.state;
    const suggestion = suggestions && suggestions[index];

    const { editor } = this.input.current;

    if (suggestion) {
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
      this.input.current.editor.navigateLineEnd();
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
      this.input.current.editor.navigateLineEnd();
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

  handleInputBlur = e => {
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

  updateSuggestions(suggestions = []) {
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

  diagnoseExpression() {
    const { source } = this.state;
    const { query, startRule, name } = this.props;
    if (!source || source.length === 0) {
      return { message: "Empty expression" };
    }
    return diagnose(source, startRule, query, name);
  }

  commitExpression() {
    const { query, startRule } = this.props;
    const { source } = this.state;
    const errorMessage = diagnose(source, startRule, query);
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

  setCaretPosition = (position, autosuggest) => {
    // FIXME setCaretPosition(this.input.current, position);
    if (autosuggest) {
      setTimeout(() => this.triggerAutosuggest());
    }
  };

  handleExpressionChange(source) {
    this.setState({ source, errorMessage: null });
    if (this.props.onBlankChange) {
      this.props.onBlankChange(source.length === 0);
    }
  }

  handleCursorChange(selection) {
    const cursor = selection.getCursor();

    const { query, startRule } = this.props;
    const { source } = this.state;
    const { suggestions, helpText } = suggest({
      query,
      startRule,
      source,
      targetOffset: cursor.column,
    });

    this.setState({ helpText });
    this.updateSuggestions(suggestions);
  }

  errorAsMarkers(errorMessage = null) {
    if (errorMessage) {
      const { pos, len } = errorMessage;
      // Because not every error message offers location info (yet)
      if (typeof pos === "number") {
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

  commands = [
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
    const { source, suggestions, errorMessage, isFocused } = this.state;

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
            role="ace-editor"
            setOptions={{
              behavioursEnabled: false,
              indentedSoftWrap: false,
              minLines: 1,
              maxLines: 9,
              showLineNumbers: false,
              showGutter: false,
              showFoldWidgets: false,
              showPrintMargin: false,
            }}
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
        <ErrorMessage error={errorMessage} />
        <HelpText
          target={this.props.helpTextTarget}
          helpText={this.state.helpText}
          width={this.props.width}
        />
      </React.Fragment>
    );
  }
}

export default ExplicitSize()(ExpressionEditorTextfield);
