/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { t } from "ttag";

import { Button } from "metabase/common/components/Button";
import { Ellipsified } from "metabase/common/components/Ellipsified";
import CS from "metabase/css/core/index.css";
import { Snippets } from "metabase/entities/snippets";
import { Flex, Icon } from "metabase/ui";

import SnippetRowS from "./SnippetRow.module.css";

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
          style={{ minWidth: 0 }}
          onClick={() => this.setState({ isOpen: !isOpen })}
        >
          <Flex
            className={SnippetRowS.SnippetContent}
            onClick={
              snippet.archived
                ? () => this.setState({ isOpen: true })
                : (e) => {
                    e.stopPropagation();
                    insertSnippet(snippet);
                  }
            }
            miw={0}
          >
            <Icon
              name="snippet"
              className={cx(
                CS.hoverChildHidden,
                CS.textLight,
                SnippetRowS.SnippetIcon,
              )}
            />
            <Icon
              name={insertSnippet ? "arrow_left_to_line" : "snippet"}
              className={cx(CS.hoverChild, SnippetRowS.SnippetIcon)}
            />
            <Ellipsified className={cx(CS.ml1)}>{snippet.name}</Ellipsified>
          </Flex>
          <Icon
            name={isOpen ? "chevronup" : "chevrondown"}
            className={cx(
              { [CS.hoverChild]: !isOpen },
              SnippetRowS.SnippetIcon,
            )}
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
              <Button
                className={SnippetRowS.SnippetButton}
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
              </Button>
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
