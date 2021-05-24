import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";

import Popover from "metabase/components/Popover";
import { UlStyled } from "./ExpressionEditorSuggestions.styled";

import { isObscured } from "metabase/lib/dom";

const SUGGESTION_SECTION_NAMES = {
  fields: t`Fields`,
  aggregations: t`Aggregations`,
  operators: t`Operators`,
  metrics: t`Metrics`,
  other: t`Other`,
};

export default class ExpressionEditorSuggestions extends React.Component {
  static propTypes = {
    suggestions: PropTypes.array,
    onSuggestionMouseDown: PropTypes.func, // signature is f(index)
    highlightedIndex: PropTypes.number.isRequired,
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
    const { suggestions, highlightedIndex } = this.props;

    if (!suggestions.length) {
      return null;
    }

    return (
      <Popover
        className="not-rounded border-dark"
        hasArrow={false}
        tetherOptions={{
          attachment: "top left",
          targetAttachment: "bottom left",
        }}
        sizeToFit
      >
        <UlStyled>
          {suggestions.map((suggestion, i) => {
            const shouldRenderSectionTitle =
              i === 0 || suggestion.type !== suggestions[i - 1].type;

            const sectionTitle =
              SUGGESTION_SECTION_NAMES[suggestion.type] || suggestion.type;

            const isHighlighted = i === highlightedIndex;

            // insert section title. assumes they're sorted by type
            return (
              <React.Fragment key={i}>
                {shouldRenderSectionTitle && (
                  <li className="mx2 h6 text-uppercase text-bold text-medium py1 pt2">
                    {sectionTitle}
                  </li>
                )}
                <li
                  ref={r => {
                    if (isHighlighted) {
                      this._selectedRow = r;
                    }
                  }}
                  style={{ paddingTop: 5, paddingBottom: 5 }}
                  className={cx(
                    "px2 cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit",
                    {
                      "text-white bg-brand": isHighlighted,
                    },
                  )}
                  onMouseDownCapture={e => this.onSuggestionMouseDown(e, i)}
                >
                  {suggestion.range ? (
                    <span>
                      {suggestion.name.slice(0, suggestion.range[0])}
                      <span
                        className={cx("text-brand text-bold hover-child", {
                          "text-white bg-brand": isHighlighted,
                        })}
                      >
                        {suggestion.name.slice(
                          suggestion.range[0],
                          suggestion.range[1],
                        )}
                      </span>
                      {suggestion.name.slice(suggestion.range[1])}
                    </span>
                  ) : (
                    suggestion.name
                  )}
                </li>
              </React.Fragment>
            );
          })}
        </UlStyled>
      </Popover>
    );
  }
}
/*
import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";

import Popover from "metabase/components/Popover";
import {
  UlStyled,
  LiStyled,
  LiStyledHighlighted,
  SectionTitle,
} from "./ExpressionEditorSuggestions.styled";

import { isObscured } from "metabase/lib/dom";

const SUGGESTION_SECTION_NAMES = {
  fields: t`Fields`,
  aggregations: t`Aggregations`,
  operators: t`Operators`,
  metrics: t`Metrics`,
  other: t`Other`,
};

export default class ExpressionEditorSuggestions extends React.Component {
  static propTypes = {
    suggestions: PropTypes.array,
    onSuggestionMouseDown: PropTypes.func, // signature is f(index)
    highlightedIndex: PropTypes.number.isRequired,
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
    const { suggestions, highlightedIndex } = this.props;

    if (!suggestions.length) {
      return null;
    }

    return (
      <Popover
        className="not-rounded border-dark"
        hasArrow={false}
        tetherOptions={{
          attachment: "top left",
          targetAttachment: "bottom left",
        }}
        sizeToFit
      >
        <UlStyled>
          {suggestions.map((suggestion, i) => {
            const shouldRenderSectionTitle =
              i === 0 || suggestion.type !== suggestions[i - 1].type;

            const sectionTitle =
              SUGGESTION_SECTION_NAMES[suggestion.type] || suggestion.type;

            const isHighlighted = i === highlightedIndex;

            return (
              <React.Fragment key={`suggestion-${i}`}>
                {shouldRenderSectionTitle && (
                  <SectionTitle>{sectionTitle}</SectionTitle>
                )}

                <LiStyled
                  ref={r => {
                    if (isHighlighted) {
                      this._selectedRow = r;
                    }
                  }}
                  onMouseDownCapture={e => this.onSuggestionMouseDown(e, i)}
                  style={{ color: isHighlighted ? "green" : "red" }}
                >
                  {suggestion.range ? (
                    <span>
                      {suggestion.name.slice(0, suggestion.range[0])}
                      <span
                        className={cx("text-brand text-bold hover-child", {
                          "text-white bg-brand": isHighlighted,
                        })}
                      >
                        {suggestion.name.slice(
                          suggestion.range[0],
                          suggestion.range[1],
                        )}
                      </span>
                      {suggestion.name.slice(suggestion.range[1])}
                    </span>
                  ) : (
                    suggestion.name
                  )}
                </LiStyled>
              </React.Fragment>
            );
          })}
        </UlStyled>
      </Popover>
    );
  }
}
*/
