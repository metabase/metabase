/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import CS from "metabase/css/core/index.css";
import Snippets from "metabase/entities/snippets";
import { Icon } from "metabase/ui";

import { SnippetButton, SnippetContent } from "./SnippetRow.styled";

class SnippetRowInner extends Component {
  constructor(props) {
    super(props);
    this.state = { isOpen: false };
  }

  render() {
    const { snippet, insertSnippet, setModalSnippet, canWrite } = this.props;

    const { description, content } = snippet;
    const { isOpen } = this.state;
    return (
      <div
        className={cx(
          { [CS.borderTransparent]: !isOpen },
          CS.borderBottom,
          CS.borderTop,
        )}
      >
        <div
          className={cx(
            CS.cursorPointer,
            CS.bgLightHover,
            CS.textBold,
            CS.flex,
            CS.alignCenter,
            CS.justifyBetween,
            CS.py2,
            CS.px3,
            CS.hoverParent,
            CS.hoverDisplay,
          )}
          onClick={() => this.setState({ isOpen: !isOpen })}
        >
          <SnippetContent
            onClick={
              snippet.archived
                ? () => this.setState({ isOpen: true })
                : e => {
                    e.stopPropagation();
                    insertSnippet(snippet);
                  }
            }
          >
            <Icon
              name="snippet"
              className={cx(CS.hoverChildHidden, CS.textLight)}
            />
            <Icon
              name={insertSnippet ? "arrow_left_to_line" : "snippet"}
              className={CS.hoverChild}
            />
            <span className={cx(CS.flexFull, CS.ml1)}>{snippet.name}</span>
          </SnippetContent>
          <Icon
            name={isOpen ? "chevronup" : "chevrondown"}
            className={cx({ [CS.hoverChild]: !isOpen })}
          />
        </div>
        {isOpen && (
          <div className={cx(CS.px3, CS.pb2, CS.pt1)}>
            {description && (
              <p className={cx(CS.textMedium, CS.mt0)}>{description}</p>
            )}
            <pre
              className={cx(
                CS.bgLight,
                CS.bordered,
                CS.rounded,
                CS.p1,
                CS.textMonospace,
                CS.textSmall,
                CS.textPreWrap,
                CS.overflowAuto,
              )}
              style={{ maxHeight: 320 }}
            >
              {content}
            </pre>
            {canWrite && (
              <SnippetButton
                onClick={
                  snippet.archived
                    ? () => snippet.update({ archived: false })
                    : () => setModalSnippet(snippet)
                }
                borderless
                medium
                icon={snippet.archived ? "unarchive" : "pencil"}
              >
                {snippet.archived ? t`Unarchive` : t`Edit`}
              </SnippetButton>
            )}
          </div>
        )}
      </div>
    );
  }
}

export const SnippetRow = Snippets.load({
  id: (state, props) => props.item.id,
  wrapped: true,
})(SnippetRowInner);
