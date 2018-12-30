import React from "react";
import { Box, Flex } from "grid-styled";
import { t, msgid, ngettext } from "c-3po";
import { connect } from "react-redux";
import { withRouter } from "react-router";
import _ from "underscore";
import cx from "classnames";
import { dissoc } from "icepick";

import withToast from "metabase/hoc/Toast";

import listSelect from "metabase/hoc/ListSelect";
import BulkActionBar from "metabase/components/BulkActionBar";

import * as Urls from "metabase/lib/urls";
import colors, { normal } from "metabase/lib/colors";

import Button from "metabase/components/Button";
import Card from "metabase/components/Card";
import Modal from "metabase/components/Modal";
import StackedCheckBox from "metabase/components/StackedCheckBox";
import EntityItem from "metabase/components/EntityItem";
import { Grid, GridItem } from "metabase/components/Grid";
import Icon, { IconWrapper } from "metabase/components/Icon";
import Link from "metabase/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import VirtualizedList from "metabase/components/VirtualizedList";
import BrowserCrumbs from "metabase/components/BrowserCrumbs";
import ItemTypeFilterBar from "metabase/components/ItemTypeFilterBar";
import CollectionEmptyState from "metabase/components/CollectionEmptyState";

import Tooltip from "metabase/components/Tooltip";

import CollectionMoveModal from "metabase/containers/CollectionMoveModal";
import EntityCopyModal from "metabase/entities/containers/EntityCopyModal";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";
import { entityTypeForObject } from "metabase/schema";

import CollectionList from "metabase/components/CollectionList";

import { getUserIsAdmin } from "metabase/selectors/user";

// drag-and-drop components
import ItemDragSource from "metabase/containers/dnd/ItemDragSource";
import CollectionDropTarget from "metabase/containers/dnd/CollectionDropTarget";
import PinPositionDropTarget from "metabase/containers/dnd/PinPositionDropTarget";
import PinDropTarget from "metabase/containers/dnd/PinDropTarget";
import ItemsDragLayer from "metabase/containers/dnd/ItemsDragLayer";

import EmptyState from "metabase/components/EmptyState";

const ROW_HEIGHT = 72;
const PAGE_PADDING = [2, 3, 4];

const ANALYTICS_CONTEXT = "Collection Landing";

const EmptyStateWrapper = ({ children }) => (
  <Box p={5} w={1} h={"200px"}>
    {children}
  </Box>
);

const DashboardEmptyState = () => (
  <EmptyStateWrapper>
    <EmptyState
      message={t`Dashboards let you collect and share data in one place.`}
      illustrationElement={<Icon name="dashboard" size={32} />}
    />
  </EmptyStateWrapper>
);

const PulseEmptyState = () => (
  <EmptyStateWrapper>
    <EmptyState
      message={t`Pulses let you send out the latest data to your team on a schedule via email or slack.`}
      illustrationElement={<Icon name="pulse" size={32} />}
    />
  </EmptyStateWrapper>
);

const QuestionEmptyState = () => (
  <EmptyStateWrapper>
    <EmptyState
      message={t`Questions are a saved look at your data.`}
      illustrationElement={<Icon name="beaker" size={32} />}
    />
  </EmptyStateWrapper>
);

const EMPTY_STATES = {
  dashboard: <DashboardEmptyState />,
  pulse: <PulseEmptyState />,
  card: <QuestionEmptyState />,
};

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

@entityListLoader({
  entityType: "search",
  entityQuery: (state, props) => ({ collection: props.collectionId }),
  wrapped: true,
})
@connect((state, props) => {
  // split out collections, pinned, and unpinned since bulk actions only apply to unpinned
  const [collections, items] = _.partition(
    props.list,
    item => item.model === "collection",
  );
  const [pinned, unpinned] = _.partition(
    items,
    item => item.collection_position != null,
  );
  // sort the pinned items by collection_position
  pinned.sort((a, b) => a.collection_position - b.collection_position);
  return {
    collections,
    pinned,
    unpinned,
    isAdmin: getUserIsAdmin(state),
  };
})
// only apply bulk actions to unpinned items
@listSelect({
  listProp: "unpinned",
  keyForItem: item => `${item.model}:${item.id}`,
})
@withRouter
class DefaultLanding extends React.Component {
  state = {
    selectedItems: null,
    selectedAction: null,
  };

  handleBulkArchive = async () => {
    try {
      await Promise.all(
        this.props.selected.map(item => item.setArchived(true)),
      );
    } finally {
      this.handleBulkActionSuccess();
    }
  };

  handleBulkMoveStart = () => {
    this.setState({
      selectedItems: this.props.selected,
      selectedAction: "move",
    });
  };

  handleBulkMove = async collection => {
    try {
      await Promise.all(
        this.state.selectedItems.map(item => item.setCollection(collection)),
      );
      this.setState({ selectedItems: null, selectedAction: null });
    } finally {
      this.handleBulkActionSuccess();
    }
  };

  handleBulkActionSuccess = () => {
    // Clear the selection in listSelect
    // Fixes an issue where things were staying selected when moving between
    // different collection pages
    this.props.onSelectNone();
  };

  render() {
    const {
      ancestors,
      collection,
      collectionId,

      collections,
      pinned,
      unpinned,

      isAdmin,
      isRoot,
      selected,
      selection,
      onToggleSelected,
      location,
    } = this.props;
    const { selectedItems, selectedAction } = this.state;

    const collectionWidth = unpinned.length > 0 ? [1, 1 / 3] : 1;
    const itemWidth = unpinned.length > 0 ? [1, 2 / 3] : 0;
    const collectionGridSize = unpinned.length > 0 ? 1 : [1, 1 / 4];

    let unpinnedItems = unpinned;

    if (location.query.type) {
      unpinnedItems = unpinned.filter(u => u.model === location.query.type);
    }

    const collectionIsEmpty =
      !unpinned.length > 0 && !collections.length > 0 && !pinned.length > 0;
    const collectionHasPins = pinned.length > 0;
    const collectionHasItems = unpinned.length > 0;

    const showSidebar =
      // if the user has write permissions or if there are collections then show the sidebar
      (collection.can_write || collections.length > 0) &&
      // there should also be at least one item, otherwise we have a different
      // new collection CTA
      !collectionIsEmpty;
    return (
      <Box>
        <Box>
          <Flex
            align="center"
            pt={2}
            pb={3}
            px={4}
            bg={pinned.length ? colors["bg-medium"] : null}
          >
            <Box>
              <Box mb={1}>
                <BrowserCrumbs
                  analyticsContext={ANALYTICS_CONTEXT}
                  crumbs={[
                    ...ancestors.map(ancestor => ({
                      title: (
                        <CollectionDropTarget collection={ancestor} margin={8}>
                          {ancestor.name}
                        </CollectionDropTarget>
                      ),
                      to: Urls.collection(ancestor.id),
                    })),
                  ]}
                />
              </Box>
              <Flex align="center">
                <h1 style={{ fontWeight: 900 }}>{collection.name}</h1>
                {collection.description && (
                  <Tooltip tooltip={collection.description}>
                    <Icon
                      name="info"
                      ml={1}
                      mt="4px"
                      color={colors["bg-dark"]}
                      hover={{ color: colors["brand"] }}
                    />
                  </Tooltip>
                )}
              </Flex>
            </Box>

            <Flex ml="auto">
              {isAdmin &&
                !collection.personal_owner_id && (
                  <Tooltip
                    tooltip={t`Edit the permissions for this collection`}
                  >
                    <Link
                      to={Urls.collectionPermissions(this.props.collectionId)}
                    >
                      <IconWrapper>
                        <Icon name="lock" />
                      </IconWrapper>
                    </Link>
                  </Tooltip>
                )}
              {collection &&
                collection.can_write &&
                !collection.personal_owner_id && (
                  <CollectionEditMenu
                    collectionId={collectionId}
                    isAdmin={isAdmin}
                    isRoot={isRoot}
                  />
                )}
              <Box ml={1}>
                <CollectionBurgerMenu />
              </Box>
            </Flex>
          </Flex>
          <Box>
            <Box>
              {collectionHasPins ? (
                <Box px={PAGE_PADDING} pt={2} pb={3} bg={colors["bg-medium"]}>
                  <CollectionSectionHeading>{t`Pins`}</CollectionSectionHeading>
                  <PinDropTarget
                    pinIndex={pinned[pinned.length - 1].collection_position + 1}
                    noDrop
                    marginLeft={8}
                    marginRight={8}
                  >
                    <Grid>
                      {pinned.map((item, index) => (
                        <GridItem
                          w={[1, 1 / 3]}
                          className="relative"
                          key={index}
                        >
                          <ItemDragSource item={item} collection={collection}>
                            <PinnedItem
                              key={`${item.model}:${item.id}`}
                              index={index}
                              item={item}
                              collection={collection}
                            />
                            <PinPositionDropTarget
                              pinIndex={item.collection_position}
                              left
                            />
                            <PinPositionDropTarget
                              pinIndex={item.collection_position + 1}
                              right
                            />
                          </ItemDragSource>
                        </GridItem>
                      ))}
                      {pinned.length % 2 === 1 ? (
                        <GridItem w={1 / 4} className="relative">
                          <PinPositionDropTarget
                            pinIndex={
                              pinned[pinned.length - 1].collection_position + 1
                            }
                          />
                        </GridItem>
                      ) : null}
                    </Grid>
                  </PinDropTarget>
                </Box>
              ) : (
                <PinDropTarget pinIndex={1} hideUntilDrag>
                  {({ hovered }) => (
                    <div
                      className={cx(
                        "p2 flex layout-centered",
                        hovered ? "text-brand" : "text-light",
                      )}
                    >
                      <Icon name="pin" mr={1} />
                      {t`Drag something here to pin it to the top`}
                    </div>
                  )}
                </PinDropTarget>
              )}
              <Box pt={[1, 2]} px={[2, 4]}>
                <Grid>
                  {showSidebar && (
                    <GridItem w={collectionWidth}>
                      <Box pr={2} className="relative">
                        <Box py={2}>
                          <CollectionSectionHeading>
                            {t`Collections`}
                          </CollectionSectionHeading>
                        </Box>
                        <CollectionList
                          analyticsContext={ANALYTICS_CONTEXT}
                          currentCollection={collection}
                          collections={collections}
                          isRoot={collectionId === "root"}
                          w={collectionGridSize}
                        />
                      </Box>
                    </GridItem>
                  )}
                  {collectionHasItems && (
                    <GridItem w={itemWidth}>
                      <Box>
                        <ItemTypeFilterBar
                          analyticsContext={ANALYTICS_CONTEXT}
                        />
                        <Card mt={1} className="relative">
                          {unpinnedItems.length > 0 ? (
                            <PinDropTarget pinIndex={null} margin={8}>
                              <Box
                                style={{
                                  position: "relative",
                                  height: ROW_HEIGHT * unpinnedItems.length,
                                }}
                              >
                                <VirtualizedList
                                  items={unpinnedItems}
                                  rowHeight={ROW_HEIGHT}
                                  renderItem={({ item, index }) => (
                                    <Box className="relative">
                                      <ItemDragSource
                                        item={item}
                                        selection={selection}
                                        collection={collection}
                                      >
                                        <NormalItem
                                          key={`${item.model}:${item.id}`}
                                          item={item}
                                          collection={collection}
                                          selection={selection}
                                          onToggleSelected={onToggleSelected}
                                          onMove={selectedItems =>
                                            this.setState({
                                              selectedItems,
                                              selectedAction: "move",
                                            })
                                          }
                                          onCopy={selectedItems =>
                                            this.setState({
                                              selectedItems,
                                              selectedAction: "copy",
                                            })
                                          }
                                        />
                                      </ItemDragSource>
                                    </Box>
                                  )}
                                />
                              </Box>
                            </PinDropTarget>
                          ) : (
                            <Box>
                              {location.query.type &&
                                EMPTY_STATES[location.query.type]}
                              <PinDropTarget
                                pinIndex={null}
                                hideUntilDrag
                                margin={10}
                              >
                                {({ hovered }) => (
                                  <div
                                    className={cx(
                                      "m2 flex layout-centered",
                                      hovered ? "text-brand" : "text-light",
                                    )}
                                  >
                                    {t`Drag here to un-pin`}
                                  </div>
                                )}
                              </PinDropTarget>
                            </Box>
                          )}
                        </Card>
                      </Box>
                    </GridItem>
                  )}
                </Grid>
                {unpinned.length === 0 && (
                  <PinDropTarget pinIndex={null} hideUntilDrag margin={10}>
                    {({ hovered }) => (
                      <Flex
                        align="center"
                        justify="center"
                        py={2}
                        m={2}
                        color={
                          hovered ? colors["brand"] : colors["text-medium"]
                        }
                      >
                        {t`Drag here to un-pin`}
                      </Flex>
                    )}
                  </PinDropTarget>
                )}

                {collectionIsEmpty && (
                  <Flex align="center" justify="center" w={1}>
                    <CollectionEmptyState />
                  </Flex>
                )}
              </Box>
            </Box>
            <BulkActionBar showing={selected.length > 0}>
              {/* NOTE: these padding and grid sizes must be carefully matched
                   to the main content above to ensure the bulk checkbox lines up */}
              <Box px={[2, 4]} py={1}>
                <Grid>
                  <GridItem w={collectionWidth} />
                  <GridItem w={itemWidth} px={[1, 2]}>
                    <Flex align="center" justify="center" px={2}>
                      <SelectionControls {...this.props} />
                      <BulkActionControls
                        onArchive={
                          _.all(selected, item => item.setArchived)
                            ? this.handleBulkArchive
                            : null
                        }
                        onMove={
                          _.all(selected, item => item.setCollection)
                            ? this.handleBulkMoveStart
                            : null
                        }
                      />
                      <Box ml="auto">
                        {ngettext(
                          msgid`${selected.length} item selected`,
                          `${selected.length} items selected`,
                          selected.length,
                        )}
                      </Box>
                    </Flex>
                  </GridItem>
                </Grid>
              </Box>
            </BulkActionBar>
          </Box>
        </Box>
        {!_.isEmpty(selectedItems) &&
          selectedAction == "copy" && (
            <Modal>
              <CollectionCopyEntityModal
                entityObject={selectedItems[0]}
                onClose={() =>
                  this.setState({ selectedItems: null, selectedAction: null })
                }
                onSaved={newEntityObject => {
                  this.setState({ selectedItems: null, selectedAction: null });
                  this.handleBulkActionSuccess();
                }}
              />
            </Modal>
          )}
        {!_.isEmpty(selectedItems) &&
          selectedAction == "move" && (
            <Modal>
              <CollectionMoveModal
                title={
                  selectedItems.length > 1
                    ? t`Move ${selectedItems.length} items?`
                    : t`Move "${selectedItems[0].getName()}"?`
                }
                onClose={() =>
                  this.setState({ selectedItems: null, selectedAction: null })
                }
                onMove={this.handleBulkMove}
              />
            </Modal>
          )}
        <ItemsDragLayer selected={selected} />
      </Box>
    );
  }
}

export const NormalItem = ({
  item,
  collection = {},
  selection = new Set(),
  onToggleSelected,
  onMove,
  onCopy,
}) => (
  <Link
    to={item.getUrl()}
    data-metabase-event={`${ANALYTICS_CONTEXT};Item Click;${item.model}`}
  >
    <EntityItem
      analyticsContext={ANALYTICS_CONTEXT}
      variant="list"
      showSelect={selection.size > 0}
      selectable
      item={item}
      type={entityTypeForObject(item)}
      name={item.getName()}
      iconName={item.getIcon()}
      iconColor={item.getColor()}
      isFavorite={item.favorite}
      onFavorite={
        item.setFavorited ? () => item.setFavorited(!item.favorite) : null
      }
      onPin={
        collection.can_write && item.setPinned
          ? () => item.setPinned(true)
          : null
      }
      onMove={
        collection.can_write && item.setCollection ? () => onMove([item]) : null
      }
      onCopy={item.copy ? () => onCopy([item]) : null}
      onArchive={
        collection.can_write && item.setArchived
          ? () => item.setArchived(true)
          : null
      }
      selected={selection.has(item)}
      onToggleSelected={() => {
        onToggleSelected(item);
      }}
    />
  </Link>
);

const PinnedItem = ({ item, index, collection }) => (
  <Link
    to={item.getUrl()}
    className="hover-parent hover--visibility"
    hover={{ color: normal.blue }}
    data-metabase-event={`${ANALYTICS_CONTEXT};Pinned Item;Click;${item.model}`}
  >
    <Card hoverable p={3}>
      <Icon name={item.getIcon()} color={item.getColor()} size={28} mb={2} />
      <Flex align="center">
        <h3>{item.getName()}</h3>
        {collection.can_write &&
          item.setPinned && (
            <Box
              ml="auto"
              className="hover-child"
              data-metabase-event={`${ANALYTICS_CONTEXT};Pinned Item;Unpin;${
                item.model
              }`}
              onClick={ev => {
                ev.preventDefault();
                item.setPinned(false);
              }}
            >
              <Icon name="pin" />
            </Box>
          )}
      </Flex>
    </Card>
  </Link>
);

const BulkActionControls = ({ onArchive, onMove }) => (
  <Box ml={1}>
    <Button
      ml={1}
      medium
      disabled={!onArchive}
      onClick={onArchive}
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Archive Items`}
    >{t`Archive`}</Button>
    <Button
      ml={1}
      medium
      disabled={!onMove}
      onClick={onMove}
      data-metabase-event={`${ANALYTICS_CONTEXT};Bulk Actions;Move Items`}
    >{t`Move`}</Button>
  </Box>
);

const SelectionControls = ({
  selected,
  deselected,
  onSelectAll,
  onSelectNone,
  size = 18,
}) =>
  deselected.length === 0 ? (
    <StackedCheckBox checked onChange={onSelectNone} size={size} />
  ) : selected.length === 0 ? (
    <StackedCheckBox onChange={onSelectAll} size={size} />
  ) : (
    <StackedCheckBox checked indeterminate onChange={onSelectAll} size={size} />
  );

@entityObjectLoader({
  entityType: "collections",
  entityId: (state, props) => props.params.collectionId,
  reload: true,
})
class CollectionLanding extends React.Component {
  render() {
    const { object: currentCollection, params: { collectionId } } = this.props;
    const isRoot = collectionId === "root";

    const ancestors =
      (currentCollection && currentCollection.effective_ancestors) || [];

    return (
      <Box>
        <DefaultLanding
          isRoot={isRoot}
          ancestors={ancestors}
          collection={currentCollection}
          collectionId={collectionId}
        />
        {
          // Need to have this here so the child modals will show up
          this.props.children
        }
      </Box>
    );
  }
}

const CollectionSectionHeading = ({ children }) => (
  <h5
    className="text-uppercase"
    style={{ color: colors["text-medium"], fontWeight: 900 }}
  >
    {children}
  </h5>
);

const CollectionEditMenu = ({ isRoot, isAdmin, collectionId }) => {
  const items = [];
  if (!isRoot) {
    items.push({
      title: t`Edit this collection`,
      icon: "editdocument",
      link: `/collection/${collectionId}/edit`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Edit Collection Click`,
    });
  }
  if (!isRoot) {
    items.push({
      title: t`Archive this collection`,
      icon: "viewArchive",
      link: `/collection/${collectionId}/archive`,
      event: `${ANALYTICS_CONTEXT};Edit Menu;Archive Collection`,
    });
  }
  return items.length > 0 ? (
    <EntityMenu items={items} triggerIcon="pencil" />
  ) : null;
};

const CollectionBurgerMenu = () => (
  <EntityMenu
    items={[
      {
        title: t`View the archive`,
        icon: "viewArchive",
        link: `/archive`,
        event: `${ANALYTICS_CONTEXT};Burger Menu;View Archive Click`,
      },
    ]}
    triggerIcon="burger"
  />
);
@withToast
class CollectionCopyEntityModal extends React.Component {
  render() {
    const { entityObject, onClose, onSaved, triggerToast } = this.props;

    return (
      <EntityCopyModal
        entityType={entityTypeForObject(entityObject)}
        entityObject={entityObject}
        copy={async values => {
          return entityObject.copy(dissoc(values, "id"));
        }}
        onClose={onClose}
        onSaved={newEntityObject => {
          triggerToast(
            <div className="flex align-center">
              {t`Duplicated ${entityObject.model}`}
              <Link
                className="link text-bold ml1"
                to={Urls.modelToUrl(entityObject.model, newEntityObject.id)}
              >
                {t`See it`}
              </Link>
            </div>,
            { icon: entityObject.model },
          );

          onSaved(newEntityObject);
        }}
      />
    );
  }
}

export default CollectionLanding;
