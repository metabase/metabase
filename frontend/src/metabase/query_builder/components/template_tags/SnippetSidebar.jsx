/* @flow weak */

import React from "react";
import PropTypes from "prop-types";

import { t } from "ttag";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import { color } from "metabase/lib/colors";

import Snippets from "metabase/entities/snippets";

import type { Snippet } from "metabase/meta/types/Snippet";
import NativeQuery from "metabase-lib/lib/queries/NativeQuery";

type Props = {
  query: NativeQuery,
  onClose: () => void,
  setModalSnippet: () => void,
  openSnippetModalWithSelectedText: () => void,
  insertSnippet: () => void,
  snippets: Snippet[],
};

type State = { showSearch: boolean, searchString: string };

const ICON_SIZE = 16;

@Snippets.loadList({ wrapped: true })
export default class SnippetSidebar extends React.Component {
  props: Props;
  state: State = { showSearch: false, searchString: "" };

  static propTypes = {
    query: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    setModalSnippet: PropTypes.func.isRequired,
    openSnippetModalWithSelectedText: PropTypes.func.isRequired,
    insertSnippet: PropTypes.func.isRequired,
  };

  showSearch = () => {
    this.setState({ showSearch: true });
    this.searchBox.focus();
  };
  hideSearch = () => {
    this.setState({ showSearch: false, searchString: "" });
  };

  render() {
    const { query, snippets, openSnippetModalWithSelectedText } = this.props;
    const { showSearch, searchString } = this.state;
    const filteredSnippets = showSearch
      ? snippets.filter(s =>
          s.name.toLowerCase().includes(searchString.toLowerCase()),
        )
      : snippets;

    return (
      <SidebarContent>
        {snippets.length === 0 ? (
          <div className="px3 flex flex-column align-center">
            <svg
              viewBox="0 0 10 10"
              className="mb2"
              style={{ width: "25%", marginTop: 120 }}
            >
              <path
                style={{ stroke: color("bg-medium"), strokeWidth: 1 }}
                d="M0,1H8M0,3H10M0,5H7M0,7H10M0,9H3"
              />
            </svg>
            <h4 className="text-medium">{t`Snippets are reusable bits of SQL`}</h4>
            <button
              onClick={openSnippetModalWithSelectedText}
              className="Button Button--primary"
              style={{ marginTop: 80 }}
            >{t`Create a snippet`}</button>
          </div>
        ) : (
          <div>
            <div className="flex align-center px3 py2 border-bottom">
              <div className="flex-full">
                <div
                  /* Hide the search input by collapsing dimensions rather than `display: none`.
                     This allows us to immediately focus on it when showSearch is set to true.*/
                  style={showSearch ? {} : { width: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <input
                    className="input input--borderless p0"
                    ref={e => (this.searchBox = e)}
                    onChange={e =>
                      this.setState({ searchString: e.target.value })
                    }
                    value={searchString}
                    onKeyDown={e => {
                      if (e.key === "Escape") {
                        this.hideSearch();
                      }
                    }}
                  />
                </div>
                <span
                  className={cx({ hide: showSearch }, "text-heavy h3")}
                >{t`Snippets`}</span>
              </div>
              <div className="flex-align-right text-medium no-decoration">
                <Icon
                  className={cx(
                    { hide: showSearch },
                    "text-brand-hover cursor-pointer mr2",
                  )}
                  onClick={this.showSearch}
                  name="search"
                  size={18}
                />
                <Icon
                  className={cx(
                    { hide: showSearch },
                    "text-brand-hover cursor-pointer",
                  )}
                  onClick={openSnippetModalWithSelectedText}
                  name="add"
                  size={18}
                />
                <Icon
                  className={cx(
                    { hide: !showSearch },
                    "text-brand-hover cursor-pointer",
                  )}
                  onClick={this.hideSearch}
                  name="close"
                  size={18}
                />
              </div>
            </div>
            {query.databaseId() == null ? (
              <p className="text-body text-centered">{t`Select a database to see its snippets.`}</p>
            ) : (
              filteredSnippets
                .filter(snippet => query.databaseId() === snippet.database_id)
                .map(snippet => (
                  <SnippetRow
                    snippet={snippet}
                    insertSnippet={this.props.insertSnippet}
                    setModalSnippet={this.props.setModalSnippet}
                  />
                ))
            )}
          </div>
        )}
      </SidebarContent>
    );
  }
}

class SnippetRow extends React.Component {
  state: { isOpen: boolean };

  constructor(props) {
    super(props);
    this.state = { isOpen: false };
  }

  render() {
    const { snippet, insertSnippet, setModalSnippet } = this.props;
    const { description, content } = snippet;
    const { isOpen } = this.state;
    return (
      <div
        key={snippet.id}
        className={cx({ "border-bottom border-top": isOpen })}
      >
        <a
          className="bg-light-blue-hover text-brand-hover hover-parent hover--display flex p2"
          onClick={() => insertSnippet(snippet)}
        >
          <Icon
            name={"snippet"}
            size={ICON_SIZE}
            className="hover-child--hidden text-light"
          />
          <Icon
            name={"arrow_left_to_line"}
            size={ICON_SIZE}
            className="hover-child"
          />
          <span className="flex-full ml1">{snippet.name}</span>
          <a
            className={cx({ "hover-child": !isOpen })}
            onClick={e => {
              e.stopPropagation();
              this.setState({ isOpen: !isOpen });
            }}
          >
            <Icon
              name={isOpen ? "chevronup" : "chevrondown"}
              size={ICON_SIZE}
            />
          </a>
        </a>
        {isOpen && (
          <div className="px2 pb2 pt1">
            {description && <p className="text-medium mt0">{description}</p>}
            <a onClick={() => setModalSnippet(snippet)} className="text-brand">
              <Icon name="pencil" size={ICON_SIZE} className="mr1" />
              Edit
            </a>
            <pre className="bg-light bordered rounded p1 text-monospace text-small text-pre-wrap overflow-x-scroll">
              {content}
            </pre>
          </div>
        )}
      </div>
    );
  }
}
