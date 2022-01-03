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

import MetabaseSettings from "metabase/lib/settings";
import colors from "metabase/lib/colors";

import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";
import ExplicitSize from "metabase/components/ExplicitSize";

import { isExpression } from "metabase/lib/expressions";

import ExpressionEditorSuggestions from "./ExpressionEditorSuggestions";
import {
  EditorContainer,
  EditorEqualsSign,
} from "./ExpressionEditorTextfield.styled";

import ExpressionMode from "./ExpressionMode";

import "./expressions.css";

const HelpText = ({ helpText, width }) =>
  helpText ? (
    <Popover
      tetherOptions={{
        attachment: "top left",
        targetAttachment: "bottom left",
      }}
      style={{ width }}
      isOpen
    >
      {/* Prevent stealing focus from input box causing the help text to be closed (metabase#17548) */}
      <div onMouseDown={e => e.preventDefault()}>
        <p
          className="p2 m0 text-monospace text-bold"
          style={{ background: colors["bg-yellow"] }}
        >
          {helpText.structure}
        </p>
        <div className="p2 border-top">
          <p className="mt0 text-bold">{helpText.description}</p>
          <p className="text-code m0 text-body">{helpText.example}</p>
        </div>
        <div className="p2 border-top">
          {helpText.args.map(({ name, description }, index) => (
            <div key={index}>
              <h4 className="text-medium">{name}</h4>
              <p className="mt1 text-bold">{description}</p>
            </div>
          ))}
          <ExternalLink
            className="link text-bold block my1"
            target="_blank"
            href={MetabaseSettings.docsUrl("users-guide/expressions")}
            tabIndex={-1}
          >
            <Icon name="reference" size={12} className="mr1" />
            {t`Learn more`}
          </ExternalLink>
        </div>
      </div>
    </Popover>
  ) : null;

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

@ExplicitSize()
class ExpressionEditorTextfield extends React.Component {
  static propTypes = {
    expression: PropTypes.array, // should be an array like [expressionObj, source]
    onChange: PropTypes.func.isRequired,
    onError: PropTypes.func.isRequired,
    startRule: PropTypes.string.isRequired,
    onBlankChange: PropTypes.func,
    onBlurWithTab: PropTypes.func,
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
    const { expression, query, startRule } = newProps;
    const source = format(expression, { query, startRule });

    this.setState({ source, expression });

    if (source) {
      this.setCaretPosition(source.length, source.length === 0);
    }

    this.clearSuggestions();
  }

  componentDidMount() {
    const { editor } = this.props.inputRef.current;
    editor.getSession().setMode(new ExpressionMode());

    editor.setOptions({
      fontFamily: "Monaco, monospace",
      fontSize: "12px",
    });

    this.setCaretPosition(
      this.state.source.length,
      this.state.source.length === 0,
    );

    this.triggerAutosuggest();
  }

  onSuggestionSelected = index => {
    const { source, suggestions } = this.state;
    const suggestion = suggestions && suggestions[index];

    const { editor } = this.props.inputRef.current;

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

        const updatedExpression = prefix + replacement.trim() + postfix;
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

  // This method focuses on the editor input.
  // Using react-ace’s `onFocus` rendered the editor code
  // with a severe vertical misalignment.
  // Occurrences of this bug were rare and non-deterministic wrt to browser.
  handleEditorLoaded = () => {
    setTimeout(() => {
      this.props.inputRef.current.editor.focus();
    }, 10);
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
      this.props.inputRef.current.editor.navigateLineEnd();
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
      this.props.inputRef.current.editor.navigateLineEnd();
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

  handleTab = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;

    if (suggestions.length) {
      this.onSuggestionSelected(highlightedSuggestionIndex);
    } else {
      this.props.onBlurWithTab();
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

    const { query, startRule } = this.props;
    const { source } = this.state;

    const errorMessage = diagnose(source, startRule, query);
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
      suggestions: [],
      highlightedSuggestionIndex: 0,
      helpText: null,
    });
  }

  compileExpression() {
    const { source } = this.state;
    if (!source || source.length === 0) {
      return null;
    }
    const { query, startRule } = this.props;
    const { expression } = processSource({ source, query, startRule });

    return expression;
  }

  commitExpression() {
    const expression = this.compileExpression();

    if (isExpression(expression)) {
      this.props.onCommit(expression);
    }
  }

  triggerAutosuggest = () => {
    this.handleExpressionChange(this.state.source);
  };

  setCaretPosition = (position, autosuggest) => {
    // FIXME setCaretPosition(this.input.current, position);
    const { editor } = this.props.inputRef.current;
    editor.moveCursorTo(0, position);
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

    this.setState({
      suggestions: suggestions || [],
      helpText,
    });
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
      name: "tab",
      bindKey: { win: "Tab", mac: "Tab" },
      exec: () => {
        this.handleTab();
      },
    },
  ];

  render() {
    const { source, suggestions, errorMessage, isFocused } = this.state;

    return (
      <React.Fragment>
        <EditorContainer isFocused={isFocused} hasError={Boolean(errorMessage)}>
          <EditorEqualsSign>=</EditorEqualsSign>
          <AceEditor
            commands={this.commands}
            ref={this.props.inputRef}
            value={source}
            markers={this.errorAsMarkers(errorMessage)}
            focus={true}
            highlightActiveLine={false}
            wrapEnabled={true}
            fontSize={12}
            onBlur={this.handleInputBlur}
            // onLoad circumvents a buggy onFocus,
            // see declaration of `handleEditorLoaded`
            onLoad={this.handleEditorLoaded}
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
            suggestions={suggestions}
            onSuggestionMouseDown={this.onSuggestionSelected}
            highlightedIndex={this.state.highlightedSuggestionIndex}
          />
        </EditorContainer>
        {!isFocused && <ErrorMessage error={errorMessage} />}
        <HelpText helpText={this.state.helpText} width={this.props.width} />
      </React.Fragment>
    );
  }
}

export default React.forwardRef((props, ref) => (
  <ExpressionEditorTextfield inputRef={ref} {...props} />
));
