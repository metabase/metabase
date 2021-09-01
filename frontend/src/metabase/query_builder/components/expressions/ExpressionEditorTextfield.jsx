/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import _ from "underscore";
import cx from "classnames";

import { format } from "metabase/lib/expressions/format";
import { processSource } from "metabase/lib/expressions/process";
import {
  tokenize,
  countMatchingParentheses,
  TOKEN,
  OPERATOR as OP,
} from "metabase/lib/expressions/tokenizer";
import MetabaseSettings from "metabase/lib/settings";
import colors from "metabase/lib/colors";

import memoize from "lodash.memoize";

import { setCaretPosition, getSelectionPosition } from "metabase/lib/dom";

import {
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

import TokenizedInput from "./TokenizedInput";

import { getMBQLName, isExpression } from "metabase/lib/expressions";

import ExpressionEditorSuggestions from "./ExpressionEditorSuggestions";

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
    // memoize processSource for performance when editing previously seen source/targetOffset
    this._processSource = memoize(processSource, ({ source, targetOffset }) =>
      // resovle should include anything that affect the results of processSource
      // except currently we exclude `startRule` and `query` since they shouldn't change
      [source, targetOffset].join(","),
    );
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

  _getParserOptions(props = this.props) {
    return {
      query: props.query,
      startRule: props.startRule,
    };
  }

  UNSAFE_componentWillMount() {
    this.UNSAFE_componentWillReceiveProps(this.props);
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    // we only refresh our state if we had no previous state OR if our expression changed
    if (!this.state || !_.isEqual(this.props.expression, newProps.expression)) {
      const parserOptions = this._getParserOptions(newProps);
      const source = format(newProps.expression, parserOptions);

      const { expression, compileError, syntaxTree } =
        source && source.length
          ? this._processSource({
              source,
              ...this._getParserOptions(newProps),
            })
          : {
              expression: null,
              tokenizerError: [],
              compileError: null,
              syntaxTree: null,
            };
      this.setState({
        source,
        expression,
        tokenizeError: [],
        compileError,
        syntaxTree,
        suggestions: [],
        highlightedSuggestionIndex: 0,
      });
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
        setTimeout(() => {
          this._setCaretPosition(caretPos, true);
        });
      } else {
        const newExpression = source + suggestion.text;
        this.onExpressionChange(newExpression);
        setTimeout(() => this._setCaretPosition(newExpression.length, true));
      }
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
      if (
        e.keyCode === KEYCODE_ENTER &&
        this.props.onCommit &&
        this.state.expression != null
      ) {
        this.props.onCommit(this.state.expression);
      }
      return;
    }
    if (e.keyCode === KEYCODE_ENTER) {
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
    });
  }

  onInputBlur = () => {
    this.clearSuggestions();

    const { tokenizerError, compileError } = this.state;
    let displayError = [...tokenizerError];
    if (compileError) {
      if (Array.isArray(compileError)) {
        displayError = [...displayError, ...compileError];
      } else {
        displayError.push(compileError);
      }
    }
    this.setState({ displayError, helpText: null });

    // whenever our input blurs we push the updated expression to our parent if valid
    if (this.state.expression) {
      if (!isExpression(this.state.expression)) {
        console.warn("isExpression=false", this.state.expression);
      }
      this.props.onChange(this.state.expression);
    } else if (displayError && displayError.length > 0) {
      this.props.onError(displayError);
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
    setCaretPosition(this.input.current, position);
    if (autosuggest) {
      setTimeout(() => this._triggerAutosuggest());
    }
  };

  onExpressionChange(source) {
    const inputElement = this.input.current;
    if (!inputElement) {
      return;
    }

    const [selectionStart, selectionEnd] = getSelectionPosition(inputElement);
    const hasSelection = selectionStart !== selectionEnd;
    const isAtEnd = selectionEnd === source.length;
    const endsWithWhitespace = /\s$/.test(source);
    const targetOffset = !hasSelection ? selectionEnd : null;

    const {
      expression,
      compileError,
      suggestions,
      helpText,
      syntaxTree,
    } = source
      ? this._processSource({
          source,
          targetOffset,
          ...this._getParserOptions(),
        })
      : {
          expression: null,
          compileError: null,
          suggestions: [],
          helpText: null,
          syntaxTree: null,
        };

    const isValid = expression !== undefined;
    if (this.props.onBlankChange) {
      this.props.onBlankChange(source.length === 0);
    }
    // don't show suggestions if
    // * there's a selection
    // * we're at the end of a valid expression, unless the user has typed another space
    const showSuggestions =
      !hasSelection && !(isValid && isAtEnd && !endsWithWhitespace);

    const { tokens, errors: tokenizerError } = tokenize(source);
    const mismatchedParentheses = countMatchingParentheses(tokens);
    const mismatchedError =
      mismatchedParentheses === 1
        ? t`Expecting a closing parenthesis`
        : mismatchedParentheses > 1
        ? t`Expecting ${mismatchedParentheses} closing parentheses`
        : mismatchedParentheses === -1
        ? t`Expecting an opening parenthesis`
        : mismatchedParentheses < -1
        ? t`Expecting ${-mismatchedParentheses} opening parentheses`
        : null;
    if (mismatchedError) {
      tokenizerError.push({
        message: mismatchedError,
      });
    }

    for (let i = 0; i < tokens.length - 1; ++i) {
      const token = tokens[i];
      if (token.type === TOKEN.Identifier && source[token.start] !== "[") {
        const functionName = source.slice(token.start, token.end);
        if (getMBQLName(functionName)) {
          const next = tokens[i + 1];
          if (next.op !== OP.OpenParenthesis) {
            tokenizerError.unshift({
              message: t`Expecting an opening parenthesis after function ${functionName}`,
            });
          }
        }
      }
    }

    this.setState({
      source,
      expression,
      syntaxTree,
      tokenizerError,
      compileError,
      displayError: null,
      suggestions: showSuggestions ? suggestions : [],
      helpText,
      highlightedSuggestionIndex: 0,
    });

    if (!source || source.length <= 0) {
      const { suggestions } = this._processSource({
        source,
        targetOffset,
        ...this._getParserOptions(),
      });
      this.setState({ suggestions });
    }
  }

  render() {
    const { placeholder } = this.props;
    const { displayError, source, suggestions, syntaxTree } = this.state;

    const inputClassName = cx("input text-bold text-monospace", {
      "text-dark": source,
      "text-light": !source,
    });
    const inputStyle = { fontSize: 12 };
    const priorityError = _.first(displayError);

    return (
      <div className={cx("relative my1")}>
        <div
          className={cx(inputClassName, "absolute top left")}
          style={{
            ...inputStyle,
            pointerEvents: "none",
            borderColor: "transparent",
          }}
        >
          {"= "}
        </div>
        <TokenizedInput
          ref={this.input}
          type="text"
          className={cx(inputClassName, {
            "border-error": priorityError,
          })}
          style={{ ...inputStyle, paddingLeft: 26, whiteSpace: "pre-wrap" }}
          placeholder={placeholder}
          value={source}
          syntaxTree={syntaxTree}
          parserOptions={this._getParserOptions()}
          onChange={e => this.onExpressionChange(e.target.value)}
          onKeyDown={this.onInputKeyDown}
          onBlur={this.onInputBlur}
          onFocus={e => this._triggerAutosuggest()}
          onClick={this.onInputClick}
          autoFocus
        />
        <ErrorMessage error={priorityError} />
        <HelpText helpText={this.state.helpText} width={this.props.width} />
        <ExpressionEditorSuggestions
          suggestions={suggestions}
          onSuggestionMouseDown={this.onSuggestionSelected}
          highlightedIndex={this.state.highlightedSuggestionIndex}
        />
      </div>
    );
  }
}
