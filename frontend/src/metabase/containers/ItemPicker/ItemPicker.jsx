/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { getCrumbs } from "metabase/lib/collections";
import { color } from "metabase/lib/colors";

// NOTE: replacing these with Collections.ListLoader etc currently fails due to circular dependency
import EntityListLoader, {
  entityListLoader,
} from "metabase/entities/containers/EntityListLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import Collections from "metabase/entities/collections";

import { isRootCollection } from "metabase/collections/utils";

import Item from "./Item";
import { ItemPickerHeader, ItemPickerList } from "./ItemPicker.styled";

const getCollectionIconColor = () => color("text-light");

const propTypes = {
  // undefined = no selection
  // null = root collection
  // number = non-root collection id
  value: PropTypes.number,
  types: PropTypes.array,
  showSearch: PropTypes.bool,
  showScroll: PropTypes.bool,
};

class ItemPicker extends React.Component {
  state = {
    parentId: "root",
    searchMode: false,
    searchString: false,
  };

  checkHasWritePermissionForItem(item, models) {
    const { collectionsById } = this.props;

    // if user is selecting a collection, they must have a `write` access to it
    if (models.has("collection") && item.model === "collection") {
      return item.can_write;
    }

    // if user is selecting something else (e.g. dashboard),
    // they must have `write` access to a collection item belongs to
    const collection = item.collection_id
      ? collectionsById[item.collection_id]
      : collectionsById["root"];
    return collection.can_write;
  }

  checkCanWriteToCollectionOrItsChildren(collection) {
    return (
      collection.can_write ||
      collection.children.some(child =>
        this.checkCanWriteToCollectionOrItsChildren(child),
      )
    );
  }

  handleSearchInputKeyPress = e => {
    if (e.key === "Enter") {
      this.setState({ searchString: e.target.value });
    }
  };

  handleOpenSearch = () => {
    this.setState({ searchMode: true });
  };

  handleCloseSearch = () => {
    this.setState({ searchMode: null, searchString: null });
  };

  handleCollectionSelected = collection => {
    const { onChange } = this.props;
    if (isRootCollection(collection)) {
      // "root" collection should have `null` id
      onChange({ id: null, model: "collection" });
    } else {
      onChange(collection);
    }
  };

  handleCollectionOpen = collectionId => {
    this.setState({ parentId: collectionId });
  };

  getSearchQuery = () => {
    const { searchString, parentId } = this.state;
    const models = new Set(this.props.models);

    const query = {};

    if (searchString) {
      query.q = searchString;
    } else {
      query.collection = parentId;
    }

    if (models.size === 1) {
      query.models = Array.from(models);
    }

    return query;
  };

  renderHeader = () => {
    const { collectionsById, showSearch = true } = this.props;
    const { parentId, searchMode } = this.state;

    const collection = collectionsById[parentId];
    const crumbs = getCrumbs(collection, collectionsById, id =>
      this.setState({ parentId: id }),
    );

    if (searchMode) {
      return (
        <ItemPickerHeader
          className="border-bottom flex align-center"
          data-testid="item-picker-header"
        >
          <input
            type="search"
            className="input rounded flex-full"
            placeholder={t`Search`}
            autoFocus
            onKeyPress={this.handleSearchInputKeyPress}
          />
          <Icon
            name="close"
            className="ml-auto pl2 text-light text-medium-hover cursor-pointer"
            onClick={this.handleCloseSearch}
          />
        </ItemPickerHeader>
      );
    }

    return (
      <ItemPickerHeader
        className="border-bottom flex align-center"
        data-testid="item-picker-header"
      >
        <Breadcrumbs crumbs={crumbs} />
        {showSearch && (
          <Icon
            name="search"
            className="ml-auto pl2 text-light text-medium-hover cursor-pointer"
            onClick={this.handleOpenSearch}
          />
        )}
      </ItemPickerHeader>
    );
  };

  render() {
    const {
      value,
      onChange,
      collectionsById,
      getCollectionIcon,
      style,
      className,
      showScroll = true,
    } = this.props;
    const { parentId, searchString } = this.state;

    const models = new Set(this.props.models);
    const modelsIncludeNonCollections =
      this.props.models.filter(model => model !== "collection").length > 0;

    const collection = collectionsById[parentId];

    let allCollections = (collection && collection.children) || [];

    // show root in itself if we can pick it
    if (
      collection &&
      isRootCollection(collection) &&
      models.has("collection")
    ) {
      allCollections = [collection, ...allCollections];
    }

    // ensure we only display collections a user can write to
    allCollections = allCollections.filter(collection =>
      this.checkCanWriteToCollectionOrItsChildren(collection),
    );

    // code below assumes items have a "model" property
    allCollections = allCollections.map(collection => ({
      ...collection,
      model: "collection",
    }));

    // special case for root collection
    const getId = item =>
      item &&
      (item.model === "collection" && item.id === null ? "root" : item.id);

    const isSelected = item =>
      item &&
      value &&
      getId(item) === getId(value) &&
      (models.size === 1 || item.model === value.model);

    return (
      <LoadingAndErrorWrapper
        loading={!collectionsById}
        className={cx({ "scroll-y": showScroll })}
      >
        <div style={style} className={cx(className, "scroll-y")}>
          {this.renderHeader()}
          <ItemPickerList data-testid="item-picker-list">
            {!searchString
              ? allCollections.map(collection => {
                  const hasChildren =
                    (collection.children &&
                      collection.children.length > 0 &&
                      // exclude root since we show root's subcollections alongside it
                      !isRootCollection(collection)) ||
                    // non-collection models are loaded on-demand so we don't know ahead of time
                    // if they have children, so we have to assume they do
                    modelsIncludeNonCollections;
                  // NOTE: this assumes the only reason you'd be selecting a collection is to modify it in some way
                  const canSelect =
                    models.has("collection") && collection.can_write;

                  const icon = getCollectionIcon(collection);

                  // only show if collection can be selected or has children
                  return canSelect || hasChildren ? (
                    <Item
                      key={`collection-${collection.id}`}
                      item={collection}
                      name={collection.name}
                      color={color(icon.color) || getCollectionIconColor()}
                      icon={icon}
                      selected={canSelect && isSelected(collection)}
                      canSelect={canSelect}
                      hasChildren={hasChildren}
                      onChange={this.handleCollectionSelected}
                      onChangeParentId={this.handleCollectionOpen}
                    />
                  ) : null;
                })
              : null}
            {(modelsIncludeNonCollections || searchString) && (
              <EntityListLoader
                entityType="search"
                entityQuery={this.getSearchQuery()}
                wrapped
              >
                {({ list }) => (
                  <div>
                    {list.map(item => {
                      const hasPermission = this.checkHasWritePermissionForItem(
                        item,
                        models,
                      );
                      if (
                        hasPermission &&
                        // only include desired models (TODO: ideally the endpoint would handle this)
                        models.has(item.model) &&
                        // remove collections unless we're searching
                        // (so a user can navigate through collections)
                        (item.model !== "collection" || !!searchString)
                      ) {
                        return (
                          <Item
                            key={item.id}
                            item={item}
                            name={item.getName()}
                            color={item.getColor()}
                            icon={item.getIcon().name}
                            selected={isSelected(item)}
                            canSelect={hasPermission}
                            onChange={onChange}
                          />
                        );
                      }
                      return null;
                    })}
                  </div>
                )}
              </EntityListLoader>
            )}
          </ItemPickerList>
        </div>
      </LoadingAndErrorWrapper>
    );
  }
}

ItemPicker.propTypes = propTypes;

export default _.compose(
  entityObjectLoader({
    id: () => "root",
    entityType: (state, props) => props.entity?.name ?? "collections",
    loadingAndErrorWrapper: false,
  }),
  entityListLoader({
    entityType: (state, props) => props.entity?.name ?? "collections",
    loadingAndErrorWrapper: false,
  }),
  connect((state, props) => ({
    collectionsById: (
      props.entity || Collections
    ).selectors.getExpandedCollectionsById(state),
    getCollectionIcon: (props.entity || Collections).objectSelectors.getIcon,
  })),
)(ItemPicker);
