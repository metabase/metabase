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

import {
  KEYCODE_TAB,
  KEYCODE_ENTER,
  KEYCODE_ESCAPE,
  KEYCODE_LEFT,
  KEYCODE_UP,
  KEYCODE_RIGHT,
  KEYCODE_DOWN,
} from "metabase/lib/keyboard";

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

const HelpText = ({ helpText, width }) =>
  helpText ? (
    <Popover
      tetherOptions={{
        attachment: "top left",
        targetAttachment: "bottom left",
      }}
      style={{ width: width }}
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
export default class ExpressionEditorTextfield extends React.Component {
  constructor() {
    super();
    this.input = React.createRef();
  }

  static propTypes = {
    expression: PropTypes.array, // should be an array like [expressionObj, source]
    onChange: PropTypes.func.isRequired,
    onError: PropTypes.func.isRequired,
    startRule: PropTypes.string.isRequired,
    onBlankChange: PropTypes.func,
  };

  static defaultProps = {
    expression: [null, ""],
    startRule: "expression",
    placeholder: "write some math!",
  };

  state: {
    isFocused: false,
  };

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    // we only refresh our state if we had no previous state OR if our expression changed
    const { expression, query, startRule } = newProps;
    if (!this.state || !_.isEqual(this.props.expression, expression)) {
      const source = format(expression, { query, startRule });
      this.setState({ source, expression });
      this.clearSuggestions();
    }
  }

  componentDidMount() {
    this._setCaretPosition(
      this.state.source.length,
      this.state.source.length === 0,
    );

    this._triggerAutosuggest();
  }

  onSuggestionSelected = index => {
    const { source, suggestions } = this.state;
    const suggestion = suggestions && suggestions[index];

    if (suggestion) {
      const { tokens } = tokenize(source);
      const token = tokens.find(t => t.end >= suggestion.index);

      const { editor } = this.input.current;
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
        this.onExpressionChange(updatedExpression);
        const caretPos = updatedExpression.length - postfix.length;

        editor.moveCursorTo(row, caretPos);
      } else {
        const newExpression = source + suggestion.text;
        this.onExpressionChange(newExpression);
        this.input.current.editor.moveCursorTo(row, newExpression.length);
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
    }
  };

  handleTab = () => {
    const { highlightedSuggestionIndex, suggestions } = this.state;
    const { editor } = this.input.current;

    if (suggestions.length) {
      this.onSuggestionSelected(highlightedSuggestionIndex);
    } else {
      editor.commands.byName.tab();
    }
  };

  onInputKeyDown = e => {
    const { suggestions, highlightedSuggestionIndex } = this.state;

    if (e.keyCode === KEYCODE_LEFT || e.keyCode === KEYCODE_RIGHT) {
      setTimeout(() => this._triggerAutosuggest());
      return;
    }

    if (e.keyCode === KEYCODE_ESCAPE) {
      e.stopPropagation();
      e.preventDefault();
      this.clearSuggestions();
      return;
    }

    if (!suggestions.length) {
      if (e.keyCode === KEYCODE_ENTER && this.props.onCommit) {
        const expression = this._compileExpression();
        if (isExpression(expression)) {
          this.props.onCommit(expression);
        }
      }
      return;
    }

    if (e.keyCode === KEYCODE_ENTER || e.keyCode === KEYCODE_TAB) {
      this.onSuggestionSelected(highlightedSuggestionIndex);
      e.preventDefault();
    } else if (e.keyCode === KEYCODE_UP) {
      this.setState({
        highlightedSuggestionIndex:
          (highlightedSuggestionIndex + suggestions.length - 1) %
          suggestions.length,
      });
      e.preventDefault();
    } else if (e.keyCode === KEYCODE_DOWN) {
      this.setState({
        highlightedSuggestionIndex:
          (highlightedSuggestionIndex + suggestions.length + 1) %
          suggestions.length,
      });
      e.preventDefault();
    }
  };

  clearSuggestions() {
    this.setState({
      suggestions: [],
      highlightedSuggestionIndex: 0,
      helpText: null,
    });
  }

  _compileExpression() {
    const { source } = this.state;
    if (!source || source.length === 0) {
      return null;
    }
    const { query, startRule } = this.props;
    const { expression } = processSource({ source, query, startRule });

    return expression;
  }

  handleEditorFocus = () => {
    this.setState({ isFocused: true });
  };

  onInputBlur = e => {
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
    const expression = this._compileExpression();
    if (expression) {
      if (!isExpression(expression)) {
        console.warn("isExpression=false", expression);
      }
      this.props.onChange(expression);
    } else if (errorMessage) {
      this.props.onError(errorMessage);
    } else {
      this.props.onError({ message: t`Invalid expression` });
    }
  };

  onInputClick = () => {
    this._triggerAutosuggest();
  };

  _triggerAutosuggest = () => {
    this.onExpressionChange(this.state.source);
  };

  _setCaretPosition = (position, autosuggest) => {
    // FIXME setCaretPosition(this.input.current, position);
    if (autosuggest) {
      setTimeout(() => this._triggerAutosuggest());
    }
  };

  onExpressionChange(source) {
    this.setState({ source });
    if (this.props.onBlankChange) {
      this.props.onBlankChange(source.length === 0);
    }
  }

  onCursorChange(selection) {
    const range = selection.getRange();
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
      suggestions: range.isEmpty() ? suggestions : [],
      helpText,
    });
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
            ref={this.input}
            value={source}
            focus={true}
            highlightActiveLine={false}
            wrapEnabled={true}
            fontSize={12}
            onBlur={this.onInputBlur}
            onFocus={this.handleEditorFocus}
            setOptions={{
              indentedSoftWrap: false,
              minLines: 1,
              maxLines: 9,
              showLineNumbers: false,
              showGutter: false,
              showFoldWidgets: false,
              showPrintMargin: false,
            }}
            onChange={source => this.onExpressionChange(source)}
            onCursorChange={selection => this.onCursorChange(selection)}
            width="100%"
          />
          <ExpressionEditorSuggestions
            suggestions={suggestions}
            onSuggestionMouseDown={this.onSuggestionSelected}
            highlightedIndex={this.state.highlightedSuggestionIndex}
          />
        </EditorContainer>
        <ErrorMessage error={errorMessage} />
        <HelpText helpText={this.state.helpText} width={this.props.width} />
      </React.Fragment>
    );
  }
}
