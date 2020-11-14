import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { t } from "ttag";
import { Flex, Box } from "grid-styled";
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

const COLLECTION_ICON_COLOR = color("text-light");

const isRoot = collection => collection.id === "root" || collection.id == null;

@entityListLoader({
  entityType: (state, props) => {
    return props.entity ? props.entity.name : "collections";
  },
  loadingAndErrorWrapper: false,
})
@connect((state, props) => ({
  collectionsById: (
    props.entity || Collections
  ).selectors.getExpandedCollectionsById(state),
  getCollectionIcon: (props.entity || Collections).objectSelectors.getIcon,
}))
export default class ItemPicker extends React.Component {
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
    showSearch: PropTypes.boolean,
  };

  // returns a list of "crumbs" starting with the "root" collection
  _getCrumbs(collection, collectionsById) {
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

  render() {
    const {
      value,
      onChange,
      collectionsById,
      getCollectionIcon,
      style,
      className,
      showSearch = true,
    } = this.props;
    const { parentId, searchMode, searchString } = this.state;

    const models = new Set(this.props.models);
    const modelsIncludeNonCollections =
      this.props.models.filter(model => model !== "collection").length > 0;

    const collection = collectionsById[parentId];
    const crumbs = this._getCrumbs(collection, collectionsById);

    let allCollections = (collection && collection.children) || [];

    // show root in itself if we can pick it
    if (collection && isRoot(collection) && models.has("collection")) {
      allCollections = [collection, ...allCollections];
    }

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
      <LoadingAndErrorWrapper loading={!collectionsById} className="scroll-y">
        <Box style={style} className={cx(className, "scroll-y")}>
          {searchMode ? (
            <Box pb={1} mb={2} className="border-bottom flex align-center">
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
            </Box>
          ) : (
            <Box pb={1} mb={2} className="border-bottom flex align-center">
              <Breadcrumbs crumbs={crumbs} />
              {showSearch && (
                <Icon
                  name="search"
                  className="ml-auto pl2 text-light text-medium-hover cursor-pointer"
                  onClick={() => this.setState({ searchMode: true })}
                />
              )}
            </Box>
          )}
          <Box className="scroll-y">
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
                  // only show if collection can be selected or has children
                  return canSelect || hasChildren ? (
                    <Item
                      item={collection}
                      name={collection.name}
                      color={COLLECTION_ICON_COLOR}
                      icon={getCollectionIcon(collection)}
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
                  ...(models.size === 1
                    ? { model: Array.from(models)[0] }
                    : {}),
                }}
                wrapped
              >
                {({ list }) => (
                  <div>
                    {list
                      .filter(
                        item =>
                          // remove collections unless we're searching
                          (item.model !== "collection" || !!searchString) &&
                          // only include desired models (TODO: ideally the endpoint would handle this)
                          models.has(item.model),
                      )
                      .map(item => (
                        <Item
                          item={item}
                          name={item.getName()}
                          color={item.getColor()}
                          icon={item.getIcon()}
                          selected={isSelected(item)}
                          canSelect
                          onChange={onChange}
                        />
                      ))}
                  </div>
                )}
              </EntityListLoader>
            )}
          </Box>
        </Box>
      </LoadingAndErrorWrapper>
    );
  }
}

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
}) => (
  <Box
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
  >
    <Flex align="center">
      <Icon name={icon} color={selected ? "white" : color} size={22} />
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
    </Flex>
  </Box>
);
