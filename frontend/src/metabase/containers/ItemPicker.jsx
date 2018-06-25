import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { Flex, Box } from "grid-styled";
import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";

import EntityListLoader, {
  entityListLoader,
} from "metabase/entities/containers/EntityListLoader";

import { getExpandedCollectionsById } from "metabase/entities/collections";

const COLLECTION_ICON_COLOR = "#DCE1E4";

const isRoot = collection => collection.id === "root" || collection.id == null;

@entityListLoader({ entityType: "collections" })
export default class ItemPicker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      parentId: "root",
    };
  }

  static propTypes = {
    // undefined = no selection
    // null = root collection
    // number = non-root collection id
    value: PropTypes.number,
    types: PropTypes.array,
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
    const { value, onChange, collections, style, className } = this.props;
    const { parentId } = this.state;

    const models = new Set(this.props.models);
    const modelsIncludeNonCollections =
      this.props.models.filter(model => model !== "collection").length > 0;

    if (!collections) {
      return <div>nope</div>;
    }

    const collectionsById = getExpandedCollectionsById(collections);
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

    const isSelected = item =>
      item &&
      value &&
      item.id === value.id &&
      (models.size === 1 || item.model === value.model);

    return (
      <Box style={style} className={className}>
        <Box pb={1} mb={2} className="border-bottom">
          <Breadcrumbs crumbs={crumbs} />
        </Box>
        <Box className="scroll-y">
          {allCollections.map(collection => (
            <Item
              item={collection}
              name={collection.name}
              color={COLLECTION_ICON_COLOR}
              icon="all"
              selected={isSelected(collection) && models.has("collection")}
              canSelect={models.has("collection")}
              hasChildren={
                (collection.children &&
                  collection.children.length > 0 &&
                  // exclude root since we show root's subcollections alongside it
                  !isRoot(collection)) ||
                modelsIncludeNonCollections
              }
              onChange={collection =>
                isRoot(collection)
                  ? // "root" collection should have `null` id
                    onChange({ id: null, model: "collection" })
                  : onChange(collection)
              }
              onChangeParentId={parentId => this.setState({ parentId })}
            />
          ))}
          {modelsIncludeNonCollections && (
            <EntityListLoader
              entityType="search"
              entityQuery={{
                collection: parentId,
                ...(models.size === 1 ? { model: Array.from(models)[0] } : {}),
              }}
              wrapped
            >
              {({ list }) =>
                list
                  .filter(
                    item =>
                      item.model !== "collection" && models.has(item.model),
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
                  ))
              }
            </EntityListLoader>
          )}
        </Box>
      </Box>
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
        : hasChildren ? () => onChangeParentId(item.id) : null
    }
    className={cx("rounded", {
      "bg-brand text-white": selected,
      "bg-brand-hover text-white-hover cursor-pointer":
        canSelect || hasChildren,
    })}
  >
    <Flex align="center">
      <Icon name={icon} color={selected ? "white" : color} size={32} />
      <h4 className="mx1">{name}</h4>
      {hasChildren && (
        <Icon
          name="chevronright"
          className={cx(
            "p1 ml-auto circular text-grey-2 border-grey-2 bordered bg-white-hover cursor-pointer",
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
