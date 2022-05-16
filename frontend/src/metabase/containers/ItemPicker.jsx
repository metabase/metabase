/* eslint-disable react/prop-types */
import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { t } from "ttag";
import _ from "underscore";
import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

import { color } from "metabase/lib/colors";

import { connect } from "react-redux";

// NOTE: replacing these with Collections.ListLoader etc currently fails due to circular dependency
import EntityListLoader, {
  entityListLoader,
} from "metabase/entities/containers/EntityListLoader";

import Collections from "metabase/entities/collections";
import {
  ItemContent,
  ItemPickerHeader,
  ItemPickerList,
  ItemRoot,
} from "./ItemPicker.styled";

const getCollectionIconColor = () => color("text-light");

const isRoot = collection => collection.id === "root" || collection.id == null;

class ItemPicker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      parentId: "root",
      searchMode: false,
      searchString: false,
    };
  }

  static propTypes = {
    // undefined = no selection
    // null = root collection
    // number = non-root collection id
    value: PropTypes.number,
    types: PropTypes.array,
    showSearch: PropTypes.bool,
    showScroll: PropTypes.bool,
  };

  // returns a list of "crumbs" starting with the "root" collection
  getCrumbs(collection, collectionsById) {
    if (collection && collection.path) {
      return [
        ...collection.path.map(id => [
          collectionsById[id].name,
          () => this.setState({ parentId: id }),
        ]),
        [collection.name],
      ];
    } else {
      return [
        [
          collectionsById["root"].name,
          () => this.setState({ parentId: collectionsById["root"].id }),
        ],
        ["Unknown"],
      ];
    }
  }

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

  render() {
    const {
      value,
      onChange,
      collectionsById,
      getCollectionIcon,
      style,
      className,
      showSearch = true,
      showScroll = true,
    } = this.props;
    const { parentId, searchMode, searchString } = this.state;

    const models = new Set(this.props.models);
    const modelsIncludeNonCollections =
      this.props.models.filter(model => model !== "collection").length > 0;

    const collection = collectionsById[parentId];
    const crumbs = this.getCrumbs(collection, collectionsById);

    let allCollections = (collection && collection.children) || [];

    // show root in itself if we can pick it
    if (collection && isRoot(collection) && models.has("collection")) {
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
          {searchMode ? (
            <ItemPickerHeader
              className="border-bottom flex align-center"
              data-testid="item-picker-header"
            >
              <input
                type="search"
                className="input rounded flex-full"
                placeholder={t`Search`}
                autoFocus
                onKeyPress={e => {
                  if (e.key === "Enter") {
                    this.setState({ searchString: e.target.value });
                  }
                }}
              />
              <Icon
                name="close"
                className="ml-auto pl2 text-light text-medium-hover cursor-pointer"
                onClick={() =>
                  this.setState({ searchMode: null, searchString: null })
                }
              />
            </ItemPickerHeader>
          ) : (
            <ItemPickerHeader
              className="border-bottom flex align-center"
              data-testid="item-picker-header"
            >
              <Breadcrumbs crumbs={crumbs} />
              {showSearch && (
                <Icon
                  name="search"
                  className="ml-auto pl2 text-light text-medium-hover cursor-pointer"
                  onClick={() => this.setState({ searchMode: true })}
                />
              )}
            </ItemPickerHeader>
          )}
          <ItemPickerList data-testid="item-picker-list">
            {!searchString
              ? allCollections.map(collection => {
                  const hasChildren =
                    (collection.children &&
                      collection.children.length > 0 &&
                      // exclude root since we show root's subcollections alongside it
                      !isRoot(collection)) ||
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
                      onChange={collection =>
                        isRoot(collection)
                          ? // "root" collection should have `null` id
                            onChange({ id: null, model: "collection" })
                          : onChange(collection)
                      }
                      onChangeParentId={parentId => this.setState({ parentId })}
                    />
                  ) : null;
                })
              : null}
            {(modelsIncludeNonCollections || searchString) && (
              <EntityListLoader
                entityType="search"
                entityQuery={{
                  ...(searchString
                    ? { q: searchString }
                    : { collection: parentId }),
                  ...(models.size === 1 ? { models: Array.from(models) } : {}),
                }}
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

export default _.compose(
  entityListLoader({
    entityType: (state, props) => {
      return props.entity ? props.entity.name : "collections";
    },
    loadingAndErrorWrapper: false,
  }),
  connect((state, props) => ({
    collectionsById: (
      props.entity || Collections
    ).selectors.getExpandedCollectionsById(state),
    getCollectionIcon: (props.entity || Collections).objectSelectors.getIcon,
  })),
)(ItemPicker);

const Item = ({
  item,
  name,
  icon,
  color,
  selected,
  canSelect,
  hasChildren,
  onChange,
  onChangeParentId,
}) => {
  const iconProps = _.isObject(icon) ? icon : { name: icon };
  return (
    <ItemRoot
      mt={1}
      p={1}
      onClick={
        canSelect
          ? () => onChange(item)
          : hasChildren
          ? () => onChangeParentId(item.id)
          : null
      }
      className={cx("rounded", {
        "bg-brand text-white": selected,
        "bg-brand-hover text-white-hover cursor-pointer":
          canSelect || hasChildren,
      })}
      data-testid="item-picker-item"
    >
      <ItemContent>
        <Icon size={22} {...iconProps} color={selected ? "white" : color} />
        <h4 className="mx1">{name}</h4>
        {hasChildren && (
          <Icon
            name="chevronright"
            className={cx(
              "p1 ml-auto circular text-light border-grey-2 bordered bg-white-hover cursor-pointer",
              {
                "bg-brand-hover": !canSelect,
              },
            )}
            onClick={e => {
              e.stopPropagation();
              onChangeParentId(item.id);
            }}
          />
        )}
      </ItemContent>
    </ItemRoot>
  );
};
