/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import _ from "underscore";
import { connect } from "react-redux";

import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";

import { getCrumbs } from "metabase/lib/collections";
import { color } from "metabase/lib/colors";

import { entityListLoader } from "metabase/entities/containers/EntityListLoader";
import { entityObjectLoader } from "metabase/entities/containers/EntityObjectLoader";

import Collections from "metabase/entities/collections";
import Search from "metabase/entities/search";

import { isRootCollection } from "metabase/collections/utils";

import Item from "./Item";
import {
  ItemPickerRoot,
  ItemPickerHeader,
  ItemPickerList,
  SearchInput,
  SearchToggle,
  ScrollAwareLoadingAndErrorWrapper,
} from "./ItemPicker.styled";

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

function mapStateToProps(state, props) {
  const entity = props.entity || Collections;
  return {
    collectionsById: entity.selectors.getExpandedCollectionsById(state),
    getCollectionIcon: entity.objectSelectors.getIcon,
  };
}

function getEntityLoaderType(state, props) {
  return props.entity?.name ?? "collections";
}

class ItemPicker extends React.Component {
  state = {
    openCollectionId: "root",
    searchMode: false,
    searchString: false,
  };

  checkHasWritePermissionForItem(item) {
    const { collectionsById, models } = this.props;

    // if user is selecting a collection, they must have a `write` access to it
    if (models.includes("collection") && item.model === "collection") {
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

  checkCollectionMaybeHasChildren = collection => {
    const { models } = this.props;
    const modelsIncludeNonCollections = models.some(
      model => model !== "collection",
    );

    if (modelsIncludeNonCollections) {
      // Non-collection models (e.g. questions, dashboards)
      // are loaded on-demand so we don't know ahead of time
      // if they have children, so we have to assume they do
      return true;
    }

    if (isRootCollection(collection)) {
      // Skip root as we don't show root's sub-collections alongside it
      return false;
    }

    return collection.children?.length > 0;
  };

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
    this.setState({ openCollectionId: collectionId });
  };

  getSearchQuery = () => {
    const { models } = this.props;
    const { searchString, openCollectionId } = this.state;

    const query = {};

    if (searchString) {
      query.q = searchString;
    } else {
      query.collection = openCollectionId;
    }

    if (models.length === 1) {
      query.models = models;
    }

    return query;
  };

  renderHeader = () => {
    const { collectionsById, showSearch = true } = this.props;
    const { openCollectionId, searchMode } = this.state;

    const collection = collectionsById[openCollectionId];
    const crumbs = getCrumbs(collection, collectionsById, id =>
      this.setState({ openCollectionId: id }),
    );

    if (searchMode) {
      return (
        <ItemPickerHeader data-testid="item-picker-header">
          <SearchInput
            type="search"
            className="input"
            placeholder={t`Search`}
            autoFocus
            onKeyPress={this.handleSearchInputKeyPress}
          />
          <SearchToggle onClick={this.handleCloseSearch}>
            <Icon name="close" />
          </SearchToggle>
        </ItemPickerHeader>
      );
    }

    return (
      <ItemPickerHeader data-testid="item-picker-header">
        <Breadcrumbs crumbs={crumbs} />
        {showSearch && (
          <SearchToggle onClick={this.handleOpenSearch}>
            <Icon name="search" />
          </SearchToggle>
        )}
      </ItemPickerHeader>
    );
  };

  render() {
    const {
      value,
      models,
      onChange,
      collectionsById,
      getCollectionIcon,
      style,
      className,
      showScroll = true,
    } = this.props;
    const { openCollectionId, searchString } = this.state;

    const modelsIncludeNonCollections = models.some(
      model => model !== "collection",
    );

    const collection = collectionsById[openCollectionId];

    let allCollections = (collection && collection.children) || [];

    // show root in itself if we can pick it
    if (
      collection &&
      isRootCollection(collection) &&
      models.includes("collection")
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
      (models.length === 1 || item.model === value.model);

    return (
      <ScrollAwareLoadingAndErrorWrapper
        loading={!collectionsById}
        hasScroll={showScroll}
      >
        <ItemPickerRoot className={className} style={style}>
          {this.renderHeader()}
          <ItemPickerList data-testid="item-picker-list">
            {!searchString &&
              allCollections.map(collection => {
                const hasChildren =
                  this.checkCollectionMaybeHasChildren(collection);

                // NOTE: this assumes the only reason you'd be selecting a collection is to modify it in some way
                const canSelect =
                  models.includes("collection") && collection.can_write;

                const icon = getCollectionIcon(collection);

                if (canSelect || hasChildren) {
                  return (
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
                      onChangeOpenCollectionId={this.handleCollectionOpen}
                    />
                  );
                }

                return null;
              })}
            {(modelsIncludeNonCollections || searchString) && (
              <Search.ListLoader query={this.getSearchQuery()} wrapped>
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
                        models.includes(item.model) &&
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
              </Search.ListLoader>
            )}
          </ItemPickerList>
        </ItemPickerRoot>
      </ScrollAwareLoadingAndErrorWrapper>
    );
  }
}

ItemPicker.propTypes = propTypes;

export default _.compose(
  entityObjectLoader({
    id: "root",
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  entityListLoader({
    entityType: getEntityLoaderType,
    loadingAndErrorWrapper: false,
  }),
  connect(mapStateToProps),
)(ItemPicker);
