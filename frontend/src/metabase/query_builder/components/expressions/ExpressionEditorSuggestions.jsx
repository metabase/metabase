/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";
import _ from "underscore";

import { HoverParent } from "metabase/components/MetadataInfo/InfoIcon";
import { Popover } from "metabase/components/MetadataInfo/Popover";
import CS from "metabase/css/core/index.css";
import { color } from "metabase/lib/colors";
import { isObscured } from "metabase/lib/dom";
import { DelayGroup, Icon } from "metabase/ui";

import { ExpressionEditorHelpTextContent } from "./ExpressionEditorHelpText";
import {
  ExpressionListItem,
  ExpressionList,
  ExpressionPopover,
  SuggestionSpanContent,
  SuggestionSpanRoot,
  SuggestionTitle,
  QueryColumnInfoIcon,
  PopoverHoverTarget,
} from "./ExpressionEditorSuggestions.styled";

const SuggestionSpan = ({ suggestion, isHighlighted }) => {
  return !isHighlighted && suggestion.range ? (
    <SuggestionSpanRoot>
      {suggestion.name.slice(0, suggestion.range[0])}
      <SuggestionSpanContent isHighlighted={isHighlighted}>
        {suggestion.name.slice(suggestion.range[0], suggestion.range[1])}
      </SuggestionSpanContent>
      {suggestion.name.slice(suggestion.range[1])}
    </SuggestionSpanRoot>
  ) : (
    suggestion.name
  );
};

SuggestionSpan.propTypes = {
  suggestion: PropTypes.object,
  isHighlighted: PropTypes.bool,
};

function colorForIcon(icon) {
  switch (icon) {
    case "segment":
      return { normal: color("accent2"), highlighted: color("brand-white") };
    case "insight":
      return { normal: color("accent1"), highlighted: color("brand-white") };
    case "function":
      return { normal: color("brand"), highlighted: color("brand-white") };
    default:
      return {
        normal: color("text-medium"),
        highlighted: color("brand-white"),
      };
  }
}
export default class ExpressionEditorSuggestions extends Component {
  static propTypes = {
    query: PropTypes.object.isRequired,
    stageIndex: PropTypes.number.isRequired,
    suggestions: PropTypes.array,
    onSuggestionMouseDown: PropTypes.func, // signature is f(index)
    highlightedIndex: PropTypes.number.isRequired,
    target: PropTypes.instanceOf(Element),
  };

  componentDidUpdate(prevProps, prevState) {
    if (
      (prevProps && prevProps.highlightedIndex) !== this.props.highlightedIndex
    ) {
      if (this._selectedRow && isObscured(this._selectedRow)) {
        this._selectedRow.scrollIntoView({ block: "nearest" });
      }
    }
  }

  // when a given suggestion is clicked
  onSuggestionMouseDown(event, index) {
    event.preventDefault();
    event.stopPropagation();

    this.props.onSuggestionMouseDown && this.props.onSuggestionMouseDown(index);
  }

  createOnMouseDownHandler = _.memoize(i => {
    return event => this.onSuggestionMouseDown(event, i);
  });

  render() {
    const { query, stageIndex, suggestions, highlightedIndex, target } =
      this.props;

    if (!suggestions.length || !target) {
      return null;
    }

    return (
      <DelayGroup>
        <ExpressionPopover
          placement="bottom-start"
          sizeToFit
          visible
          reference={target}
          zIndex={300}
          content={
            <ExpressionList
              data-testid="expression-suggestions-list"
              className={CS.pb1}
            >
              {suggestions.map((suggestion, i) => (
                <ExpressionEditorSuggestionsListItem
                  key={`suggestion-${i}`}
                  query={query}
                  stageIndex={stageIndex}
                  suggestion={suggestion}
                  isHighlighted={i === highlightedIndex}
                  onMouseDownCapture={this.createOnMouseDownHandler(i)}
                />
              ))}
            </ExpressionList>
          }
        />
      </DelayGroup>
    );
  }
}

function ExpressionEditorSuggestionsListItem({
  query,
  stageIndex,
  suggestion,
  isHighlighted,
  onMouseDownCapture,
}) {
  const { icon, helpText } = suggestion;
  const { normal, highlighted } = colorForIcon(icon);

  return (
    <HoverParent>
      <ExpressionListItem
        onMouseDownCapture={onMouseDownCapture}
        isHighlighted={isHighlighted}
        className={cx(CS.hoverParent, CS.hoverInherit)}
        data-ignore-outside-clicks
        data-testid="expression-suggestions-list-item"
      >
        <Icon
          name={icon}
          color={isHighlighted ? highlighted : normal}
          className={CS.mr1}
          data-ignore-outside-clicks
        />
        <SuggestionTitle data-ignore-outside-clicks>
          <SuggestionSpan
            suggestion={suggestion}
            isHighlighted={isHighlighted}
            data-ignore-outside-clicks
          />
        </SuggestionTitle>
        {helpText && (
          <Popover
            position="right"
            content={<ExpressionEditorHelpTextContent helpText={helpText} />}
            width={450}
          >
            <PopoverHoverTarget
              name="info_filled"
              hasDescription
              aria-label={t`More info`}
            />
          </Popover>
        )}
        {!helpText && (
          <QueryColumnInfoIcon
            query={query}
            stageIndex={stageIndex}
            column={suggestion.column}
            position="right"
          />
        )}
      </ExpressionListItem>
    </HoverParent>
  );
}
