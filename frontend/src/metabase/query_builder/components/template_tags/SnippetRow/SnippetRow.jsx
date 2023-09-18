/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";
import cx from "classnames";
import { Icon } from "metabase/core/components/Icon";
import Snippets from "metabase/entities/snippets";
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
          { "border-transparent": !isOpen },
          "border-bottom border-top",
        )}
      >
        <div
          className="cursor-pointer bg-light-hover text-bold flex align-center justify-between py2 px3 hover-parent hover--display"
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
            <Icon name="snippet" className="hover-child--hidden text-light" />
            <Icon
              name={insertSnippet ? "arrow_left_to_line" : "snippet"}
              className="hover-child"
            />
            <span className="flex-full ml1">{snippet.name}</span>
          </SnippetContent>
          <Icon
            name={isOpen ? "chevronup" : "chevrondown"}
            className={cx({ "hover-child": !isOpen })}
          />
        </div>
        {isOpen && (
          <div className="px3 pb2 pt1">
            {description && <p className="text-medium mt0">{description}</p>}
            <pre
              className="bg-light bordered rounded p1 text-monospace text-small text-pre-wrap overflow-auto"
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
