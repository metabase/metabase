/* @flow weak */

import React from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import {
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
} from "metabase/plugins";
import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import SnippetRow from "./snippet-sidebar/SnippetRow";
import { color } from "metabase/lib/colors";

import Snippets from "metabase/entities/snippets";
import SnippetCollections from "metabase/entities/snippet-collections";
import { canonicalCollectionId } from "metabase/entities/collections";
import Search from "metabase/entities/search";

import type { Snippet } from "metabase-types/types/Snippet";

type Props = {
  onClose: () => void,
  setModalSnippet: () => void,
  openSnippetModalWithSelectedText: () => void,
  insertSnippet: () => void,
  snippets: Snippet[],
  snippetCollection: any,
  snippetCollections: any[],
  search: any[],
  setSnippetCollectionId: () => void,
};

type State = {
  showSearch: boolean,
  searchString: string,
  showArchived: boolean,
};

const ICON_SIZE = 16;
const HEADER_ICON_SIZE = 18;
const MIN_SNIPPETS_FOR_SEARCH = 15;

@Snippets.loadList()
@SnippetCollections.loadList()
@SnippetCollections.load({
  id: (state, props) =>
    props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
  wrapped: true,
})
@Search.loadList({
  query: (state, props) => ({
    collection:
      props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
    namespace: "snippets",
  }),
})
export default class SnippetSidebar extends React.Component {
  props: Props;
  state: State = {
    showSearch: false,
    searchString: "",
    showArchived: false,
  };
  searchBox: ?HTMLInputElement;

  static propTypes = {
    onClose: PropTypes.func.isRequired,
    setModalSnippet: PropTypes.func.isRequired,
    openSnippetModalWithSelectedText: PropTypes.func.isRequired,
    insertSnippet: PropTypes.func.isRequired,
  };

  showSearch = () => {
    this.setState({ showSearch: true });
    this.searchBox && this.searchBox.focus();
  };
  hideSearch = () => {
    this.setState({ showSearch: false, searchString: "" });
  };

  footer = () => (
    <div
      className="p2 flex text-small text-medium cursor-pointer text-brand-hover hover-parent hover--display"
      onClick={() => this.setState({ showArchived: true })}
    >
      <Icon
        className="mr1 text-light hover-child--hidden"
        name="archive"
        size={ICON_SIZE}
      />
      <Icon
        className="mr1 text-brand hover-child"
        name="archive"
        size={ICON_SIZE}
      />
      {t`Archived snippets`}
    </div>
  );

  render() {
    const {
      snippets,
      openSnippetModalWithSelectedText,
      snippetCollection,
      search,
    } = this.props;
    const { showSearch, searchString, showArchived } = this.state;

    if (showArchived) {
      return (
        <ArchivedSnippets
          onBack={() => this.setState({ showArchived: false })}
        />
      );
    }

    const displayedItems = showSearch
      ? snippets.filter(snippet =>
          snippet.name.toLowerCase().includes(searchString.toLowerCase()),
        )
      : _.sortBy(search, "model"); // relies on "collection" sorting before "snippet";

    return (
      <SidebarContent footer={this.footer()}>
        {!showSearch &&
        displayedItems.length === 0 &&
        snippetCollection.id === "root" ? (
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
            <div
              className="flex align-center pl3 pr2"
              style={{ paddingTop: 10, paddingBottom: 11 }}
            >
              <div className="flex-full">
                <div
                  /* Hide the search input by collapsing dimensions rather than `display: none`.
                     This allows us to immediately focus on it when showSearch is set to true.*/
                  style={showSearch ? {} : { width: 0, height: 0 }}
                  className="text-heavy h3 overflow-hidden"
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
                <span className={cx({ hide: showSearch }, "text-heavy h3")}>
                  {snippetCollection.id === "root" ? (
                    t`Snippets`
                  ) : (
                    <span
                      className="text-brand-hover cursor-pointer"
                      onClick={() => {
                        const parentId = snippetCollection.parent_id;
                        this.props.setSnippetCollectionId(
                          // if this collection's parent isn't in the list, we don't have perms to see it, return to the root instead
                          this.props.snippetCollections.some(
                            sc =>
                              canonicalCollectionId(sc.id) ===
                              canonicalCollectionId(parentId),
                          )
                            ? parentId
                            : null,
                        );
                      }}
                    >
                      <Icon name="chevronleft" className="mr1" />
                      {snippetCollection.name}
                    </span>
                  )}
                </span>
              </div>
              <div className="flex-align-right flex align-center text-medium no-decoration">
                {[
                  ...PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.map(f =>
                    f(this, { className: "mr2" }),
                  ),
                ]}
                {snippets.length >= MIN_SNIPPETS_FOR_SEARCH && (
                  <Icon
                    className={cx(
                      { hide: showSearch },
                      "text-brand-hover cursor-pointer mr1",
                    )}
                    onClick={this.showSearch}
                    name="search"
                    size={HEADER_ICON_SIZE}
                  />
                )}

                {snippetCollection.can_write && (
                  <PopoverWithTrigger
                    triggerClasses="flex"
                    triggerElement={
                      <Icon
                        className={cx(
                          { hide: showSearch },
                          "text-brand bg-light-hover rounded p1 cursor-pointer",
                        )}
                        name="add"
                        size={HEADER_ICON_SIZE}
                      />
                    }
                  >
                    {({ onClose }) => (
                      <div className="flex flex-column">
                        {[
                          {
                            icon: "snippet",
                            name: t`New snippet`,
                            onClick: openSnippetModalWithSelectedText,
                          },
                          ...PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.map(f =>
                            f(this),
                          ),
                        ].map(({ icon, name, onClick }) => (
                          <div
                            className="p2 bg-medium-hover flex cursor-pointer text-brand-hover"
                            onClick={() => {
                              onClick();
                              onClose();
                            }}
                          >
                            <Icon
                              name={icon}
                              size={ICON_SIZE}
                              className="mr2"
                            />
                            <h4>{name}</h4>
                          </div>
                        ))}
                      </div>
                    )}
                  </PopoverWithTrigger>
                )}
                <Icon
                  className={cx(
                    { hide: !showSearch },
                    "p1 text-brand-hover cursor-pointer",
                  )}
                  onClick={this.hideSearch}
                  name="close"
                  size={HEADER_ICON_SIZE}
                />
              </div>
            </div>
            <div className="flex-full">
              {displayedItems.length > 0
                ? displayedItems.map(item => (
                    <Row
                      key={`${item.model || "snippet"}-${item.id}`}
                      item={item}
                      type={item.model || "snippet"}
                      setSidebarState={this.setState.bind(this)}
                      canWrite={snippetCollection.can_write}
                      {...this.props}
                    />
                  ))
                : null}
            </div>
          </div>
        )}
        {PLUGIN_SNIPPET_SIDEBAR_MODALS.map(f => f(this))}
      </SidebarContent>
    );
  }
}

@SnippetCollections.loadList({ query: { archived: true }, wrapped: true })
@connect((state, { list }) => ({ archivedSnippetCollections: list }))
@SnippetCollections.loadList()
@Snippets.loadList({ query: { archived: true }, wrapped: true })
class ArchivedSnippets extends React.Component {
  render() {
    const {
      onBack,
      snippets,
      snippetCollections,
      archivedSnippetCollections,
    } = this.props;
    const collectionsById = _.indexBy(
      snippetCollections.concat(archivedSnippetCollections),
      c => canonicalCollectionId(c.id),
    );

    return (
      <SidebarContent>
        <SidebarHeader
          className="p2"
          title={t`Archived snippets`}
          onBack={onBack}
        />

        {archivedSnippetCollections.map(collection => (
          <Row
            key={`collection-${collection.id}`}
            item={collection}
            type="collection"
          />
        ))}
        {snippets.map(snippet => (
          <Row
            key={`snippet-${snippet.id}`}
            item={snippet}
            type="snippet"
            canWrite={
              collectionsById[
                // `String` used to appease flow
                String(canonicalCollectionId(snippet.collection_id))
              ].can_write
            }
          />
        ))}
      </SidebarContent>
    );
  }
}

function Row(props) {
  const Component = {
    snippet: SnippetRow,
    ...PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  }[props.type];
  return Component ? <Component {...props} /> : null;
}
