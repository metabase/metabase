import { Component, createRef } from "react";
import { t } from "ttag";
import _ from "underscore";

import { canonicalCollectionId } from "metabase/collections/utils";
import CS from "metabase/css/core/index.css";
import Search from "metabase/entities/search";
import SnippetCollections from "metabase/entities/snippet-collections";
import Snippets from "metabase/entities/snippets";
import { connect } from "metabase/lib/redux";
import {
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_MODALS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
} from "metabase/plugins";
import SidebarContent from "metabase/query_builder/components/SidebarContent";
import SidebarHeader from "metabase/query_builder/components/SidebarHeader";
import { Box, Button, Flex, Icon, Menu } from "metabase/ui";
import type {
  Collection,
  CollectionId,
  NativeQuerySnippet,
} from "metabase-types/api";
import type { State } from "metabase-types/store";

import { SnippetRow } from "../SnippetRow";

import S from "./SnippetSidebar.module.css";
import { SnippetSidebarEmptyState } from "./SnippetSidebarEmptyState";

const MIN_SNIPPETS_FOR_SEARCH = 1;

export interface SnippetSidebarProps {
  onClose: () => void;
  setModalSnippet: () => void;
  openSnippetModalWithSelectedText: () => void;
  insertSnippet: () => void;
  snippets: NativeQuerySnippet[];
  snippetCollection: Collection;
  snippetCollections: Collection[];
  search: Record<string, any>[];
  snippetCollectionId?: CollectionId | null;
  setSnippetCollectionId: (
    collectionId: CollectionId | null | undefined,
  ) => void;
}

class SnippetSidebarInner extends Component<SnippetSidebarProps> {
  state = {
    showSearch: false,
    searchString: "",
    showArchived: false,
  };

  searchBox = createRef<HTMLInputElement>();

  componentDidUpdate() {
    if (this.state.showSearch) {
      this.searchBox.current?.focus();
    }
  }

  showSearch = () => {
    this.setState({ showSearch: true });
  };

  hideSearch = () => {
    this.setState({ showSearch: false, searchString: "" });
  };

  footer = () => (
    <Flex
      className={S.SidebarFooter}
      p="md"
      onClick={() => this.setState({ showArchived: true })}
    >
      <Icon mr="sm" name="view_archive" />
      {t`Archived snippets`}
    </Flex>
  );

  render() {
    const {
      snippets,
      openSnippetModalWithSelectedText,
      snippetCollection,
      snippetCollections,
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
      ? snippets.filter((snippet) =>
          snippet.name.toLowerCase().includes(searchString.toLowerCase()),
        )
      : _.sortBy(search, "model"); // relies on "collection" sorting before "snippet";

    const hasParentCollection = snippetCollection.parent_id !== null;
    const onSnippetCollectionBack = () => {
      // if this collection's parent isn't in the list,
      // we don't have perms to see it, return to the root instead
      const hasPermissionToSeeParent = snippetCollections.some(
        (collection) =>
          canonicalCollectionId(collection.id) ===
          canonicalCollectionId(snippetCollection.parent_id),
      );

      const targetId = hasPermissionToSeeParent
        ? snippetCollection.parent_id
        : null;

      this.props.setSnippetCollectionId(targetId);
    };

    return (
      <SidebarContent footer={this.footer()}>
        {!showSearch &&
        displayedItems.length === 0 &&
        snippetCollection.id === "root" ? (
          <SnippetSidebarEmptyState
            onClick={openSnippetModalWithSelectedText}
          />
        ) : (
          <>
            <Flex align="center" justify="space-between" p="md" pl="lg" pr="sm">
              {showSearch ? (
                <>
                  <input
                    ref={this.searchBox}
                    className={CS.inputBorderless}
                    onChange={(e) =>
                      this.setState({ searchString: e.target.value })
                    }
                    value={searchString}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        this.hideSearch();
                      }
                    }}
                  />
                  <Button
                    variant="transparent"
                    onClick={this.hideSearch}
                    className={S.HeaderButton}
                  >
                    <Icon name="close" />
                  </Button>
                </>
              ) : (
                <>
                  {snippetCollection.id === "root" ? (
                    <SidebarHeader title={t`Snippets`} />
                  ) : (
                    <SidebarHeader
                      title={snippetCollection.name}
                      onBack={
                        hasParentCollection ? onSnippetCollectionBack : null
                      }
                    />
                  )}

                  <Flex
                    align="center"
                    justify="flex-end"
                    data-testid="snippet-header-buttons"
                  >
                    {[
                      ...PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.map((f) =>
                        (f as any)(this, { className: S.HeaderButton }),
                      ),
                    ]}

                    {snippets.length >= MIN_SNIPPETS_FOR_SEARCH && (
                      <Button
                        variant="transparent"
                        onClick={this.showSearch}
                        className={S.HeaderButton}
                      >
                        <Icon name="search" />
                      </Button>
                    )}

                    {snippetCollection.can_write && !showSearch && (
                      <Menu position="bottom-end">
                        <Menu.Target>
                          <Button
                            variant="transparent"
                            className={S.HeaderButton}
                          >
                            <Icon name="add" />
                          </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                          {[
                            {
                              icon: "snippet",
                              name: t`New snippet`,
                              onClick: openSnippetModalWithSelectedText,
                            },
                            ...PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS.map(
                              (f) => (f as any)(this),
                            ),
                          ].map(({ icon, name, onClick }) => (
                            <Menu.Item
                              key={name}
                              onClick={onClick}
                              leftSection={<Icon name={icon} />}
                            >
                              {name}
                            </Menu.Item>
                          ))}
                        </Menu.Dropdown>
                      </Menu>
                    )}
                  </Flex>
                </>
              )}
            </Flex>

            <Flex direction="column">
              {displayedItems.map((item) => (
                <Row
                  key={`${("model" in item && item.model) || "snippet"}-${item.id}`}
                  item={item}
                  type={("model" in item && item.model) || "snippet"}
                  setSidebarState={this.setState.bind(this)}
                  canWrite={snippetCollection.can_write}
                  {...this.props}
                />
              ))}
            </Flex>
          </>
        )}
        {PLUGIN_SNIPPET_SIDEBAR_MODALS.map((f) => (f as any)(this))}
      </SidebarContent>
    );
  }
}

export const SnippetSidebar: typeof SnippetSidebarInner = _.compose(
  Snippets.loadList(),
  SnippetCollections.loadList(),
  SnippetCollections.load({
    id: (state: State, props: { snippetCollectionId: CollectionId }) =>
      props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
    wrapped: true,
  }),
  Search.loadList({
    query: (state: State, props: { snippetCollectionId: CollectionId }) => ({
      collection:
        props.snippetCollectionId === null ? "root" : props.snippetCollectionId,
      namespace: "snippets",
    }),
  }),
)(SnippetSidebarInner);

function ArchivedSnippetsInner(props: {
  onBack: () => void;
  snippets: NativeQuerySnippet[];
  snippetCollections: Collection[];
  archivedSnippetCollections: Collection[];
}) {
  const { onBack, snippets, snippetCollections, archivedSnippetCollections } =
    props;
  const collectionsById = _.indexBy(
    snippetCollections.concat(archivedSnippetCollections),
    // @ts-expect-error -- collection id can be nullable
    (c) => canonicalCollectionId(c.id),
  );

  return (
    <SidebarContent>
      <Box p="lg">
        <SidebarHeader title={t`Archived snippets`} onBack={onBack} />
      </Box>

      {archivedSnippetCollections.map((collection) => (
        <Row
          key={`collection-${collection.id}`}
          item={collection}
          type="collection"
        />
      ))}
      {snippets.map((snippet) => (
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

const ArchivedSnippets = _.compose(
  SnippetCollections.loadList({ query: { archived: true }, wrapped: true }),
  connect((state: State, { list }: { list: Collection[] }) => ({
    archivedSnippetCollections: list,
  })),
  SnippetCollections.loadList(),
  Snippets.loadList({ query: { archived: true }, wrapped: true }),
)(ArchivedSnippetsInner);

interface RowProps {
  type: string;
  item: Record<string, any>;
  canWrite?: boolean;
  setSidebarState?: (state: { showArchived: boolean }) => void;
}

function Row(props: RowProps) {
  const Component = {
    snippet: SnippetRow,
    ...PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  }[props.type] as React.ComponentType<RowProps>;
  return Component ? <Component {...props} /> : null;
}
