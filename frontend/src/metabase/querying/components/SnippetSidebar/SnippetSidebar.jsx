/* eslint-disable react/prop-types */
import PropTypes from "prop-types";
import * as React from "react";
import { t } from "ttag";
import _ from "underscore";

import {
  useGetCollectionQuery,
  useListCollectionItemsQuery,
  useListCollectionsQuery,
  useListSnippetsQuery,
} from "metabase/api";
import { canonicalCollectionId } from "metabase/collections/utils";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { SidebarHeader } from "metabase/common/components/SidebarHeader";
import CS from "metabase/css/core/index.css";
import {
  PLUGIN_REMOTE_SYNC,
  PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS,
  PLUGIN_SNIPPET_SIDEBAR_PLUS_MENU_OPTIONS,
  PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
} from "metabase/plugins";
import { useDispatch, useSelector } from "metabase/redux";
import { Box, Button, Flex, Icon, Menu } from "metabase/ui";

import { SnippetRow } from "./SnippetRow";
import S from "./SnippetSidebar.module.css";
import { SnippetSidebarEmptyState } from "./SnippetSidebarEmptyState";

const MIN_SNIPPETS_FOR_SEARCH = 1;

/**
 * @typedef {import("metabase/plugins").SnippetSidebarProps} SnippetSidebarProps
 * @typedef {import("metabase/plugins").SnippetSidebarState} SnippetSidebarState
 */

/**
 * @extends {React.Component<SnippetSidebarProps, SnippetSidebarState>}
 */
class SnippetSidebarInner extends React.Component {
  state = {
    showSearch: false,
    searchString: "",
    showArchived: false,
  };

  static propTypes = {
    onClose: PropTypes.func.isRequired,
    setModalSnippet: PropTypes.func.isRequired,
    openSnippetModalWithSelectedText: PropTypes.func.isRequired,
    insertSnippet: PropTypes.func.isRequired,
    isRemoteSyncReadOnly: PropTypes.bool.isRequired,
  };

  searchBox = React.createRef();

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
      isRemoteSyncReadOnly,
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

    const collectionsById = _.indexBy(snippetCollections, "id");
    const snippetsById = _.indexBy(snippets, "id");
    const hydrateSearchItem = (item) => {
      const model = item.model || "snippet";
      const full =
        model === "collection"
          ? collectionsById[item.id]
          : snippetsById[item.id];
      return full ? { ...full, model } : item;
    };

    const displayedItems = showSearch
      ? snippets.filter((snippet) =>
          snippet.name.toLowerCase().includes(searchString.toLowerCase()),
        )
      : _.sortBy(search, "model").map(hydrateSearchItem); // relies on "collection" sorting before "snippet";

    const onSnippetCollectionBack = () => {
      const parentCollectionId = snippetCollection.parent_id ?? "root";

      // if this collection's parent isn't in the list,
      // we don't have perms to see it, return to the root instead
      const hasPermissionToSeeParent = snippetCollections.some(
        (collection) =>
          canonicalCollectionId(collection.id) ===
          canonicalCollectionId(parentCollectionId),
      );

      const targetId = hasPermissionToSeeParent
        ? snippetCollection.parent_id
        : null;

      this.props.setSnippetCollectionId(targetId);
    };
    const showAddMenu =
      snippetCollection.can_write && !showSearch && !isRemoteSyncReadOnly;

    return (
      <SidebarContent footer={this.footer()}>
        {!showSearch &&
        displayedItems.length === 0 &&
        snippetCollection.id === "root" ? (
          <SnippetSidebarEmptyState
            areSnippetsReadOnly={isRemoteSyncReadOnly}
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
                      onBack={onSnippetCollectionBack}
                    />
                  )}

                  <Flex
                    align="center"
                    justify="flex-end"
                    data-testid="snippet-header-buttons"
                  >
                    {[
                      ...PLUGIN_SNIPPET_SIDEBAR_HEADER_BUTTONS.map((f) =>
                        f(this, { className: S.HeaderButton }),
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

                    {showAddMenu && (
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
                              (f) => f(this),
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
                  key={`${item.model || "snippet"}-${item.id}`}
                  item={item}
                  type={item.model || "snippet"}
                  setSidebarState={this.setState.bind(this)}
                  canWrite={
                    snippetCollection.can_write && !isRemoteSyncReadOnly
                  }
                  {...this.props}
                />
              ))}
            </Flex>
          </>
        )}
      </SidebarContent>
    );
  }
}

function SnippetSidebarWithSearch(props) {
  const collectionId =
    props.snippetCollectionId === null ? "root" : props.snippetCollectionId;
  const {
    data: searchResponse,
    isLoading,
    error,
  } = useListCollectionItemsQuery({
    id: collectionId,
    namespace: "snippets",
  });
  const search = searchResponse?.data ?? [];
  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      <SnippetSidebarInner {...props} search={search} />
    </LoadingAndErrorWrapper>
  );
}

export function SnippetSidebar(props) {
  const dispatch = useDispatch();
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const collectionId =
    props.snippetCollectionId === null ? "root" : props.snippetCollectionId;

  const {
    data: snippets,
    isLoading: snippetsLoading,
    error: snippetsError,
  } = useListSnippetsQuery();
  const {
    data: snippetCollections,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useListCollectionsQuery({ namespace: "snippets" });
  const {
    data: snippetCollection,
    isLoading: collectionLoading,
    error: collectionError,
  } = useGetCollectionQuery({ id: collectionId, namespace: "snippets" });

  const isLoading = snippetsLoading || collectionsLoading || collectionLoading;
  const error = snippetsError || collectionsError || collectionError;

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      {snippets && snippetCollections && snippetCollection && (
        <SnippetSidebarWithSearch
          {...props}
          snippets={snippets}
          snippetCollections={snippetCollections}
          snippetCollection={snippetCollection}
          isRemoteSyncReadOnly={isRemoteSyncReadOnly}
          dispatch={dispatch}
        />
      )}
    </LoadingAndErrorWrapper>
  );
}

function ArchivedSnippetsInner(props) {
  const {
    onBack,
    snippets,
    snippetCollections,
    archivedSnippetCollections,
    isRemoteSyncReadOnly,
  } = props;
  const collectionsById = _.indexBy(
    snippetCollections.concat(archivedSnippetCollections),
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
          canWrite={!isRemoteSyncReadOnly}
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
            ].can_write && !isRemoteSyncReadOnly
          }
        />
      ))}
    </SidebarContent>
  );
}

function ArchivedSnippets(props) {
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const {
    data: snippets,
    isLoading: snippetsLoading,
    error: snippetsError,
  } = useListSnippetsQuery({ archived: true });
  const {
    data: snippetCollections,
    isLoading: collectionsLoading,
    error: collectionsError,
  } = useListCollectionsQuery({ namespace: "snippets" });
  const {
    data: archivedSnippetCollections,
    isLoading: archivedCollectionsLoading,
    error: archivedCollectionsError,
  } = useListCollectionsQuery({ namespace: "snippets", archived: true });

  const isLoading =
    snippetsLoading || collectionsLoading || archivedCollectionsLoading;
  const error = snippetsError || collectionsError || archivedCollectionsError;

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
      {snippets && snippetCollections && archivedSnippetCollections && (
        <ArchivedSnippetsInner
          {...props}
          snippets={snippets}
          snippetCollections={snippetCollections}
          archivedSnippetCollections={archivedSnippetCollections}
          isRemoteSyncReadOnly={isRemoteSyncReadOnly}
        />
      )}
    </LoadingAndErrorWrapper>
  );
}

function Row(props) {
  const Component = {
    snippet: SnippetRow,
    ...PLUGIN_SNIPPET_SIDEBAR_ROW_RENDERERS,
  }[props.type];
  return Component ? <Component {...props} /> : null;
}
