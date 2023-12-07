import { Component, Fragment } from "react";
import PropTypes from "prop-types";
import { color } from "metabase/lib/colors";
import { Icon } from "metabase/core/components/Icon";
import { isObscured } from "metabase/lib/dom";
import {
  ExpressionListItem,
  ExpressionList,
  ExpressionPopover,
  SuggestionSpanContent,
  SuggestionSpanRoot,
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

  render() {
    const { suggestions, highlightedIndex, target } = this.props;

    if (!suggestions.length || !target) {
      return null;
    }

    return (
      /* data-ignore-outside-clicks is required until this expression editor is migrated to the mantine's Popover */
      <ExpressionPopover
        placement="bottom-start"
        sizeToFit
        visible
        reference={target}
        content={
          <ExpressionList
            data-testid="expression-suggestions-list"
            className="pb1"
            data-ignore-outside-clicks
          >
            {suggestions.map((suggestion, i) => {
              const isHighlighted = i === highlightedIndex;
              const { icon } = suggestion;
              const { normal, highlighted } = colorForIcon(icon);

              const key = `$suggstion-${i}`;
              const listItem = (
                <ExpressionListItem
                  onMouseDownCapture={e => this.onSuggestionMouseDown(e, i)}
                  isHighlighted={isHighlighted}
                  className="hover-parent hover--inherit"
                  data-ignore-outside-clicks
                >
                  <Icon
                    name={icon}
                    color={isHighlighted ? highlighted : normal}
                    className="mr1"
                    data-ignore-outside-clicks
                  />
                  <SuggestionSpan
                    suggestion={suggestion}
                    isHighlighted={isHighlighted}
                    data-ignore-outside-clicks
                  />
                </ExpressionListItem>
              );

              return <Fragment key={key}>{listItem}</Fragment>;
            })}
          </ExpressionList>
        }
      />
    );
  }
}
