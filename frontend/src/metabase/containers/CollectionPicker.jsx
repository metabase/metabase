import React from "react";
import PropTypes from "prop-types";
import cx from "classnames";

import { Flex, Box } from "grid-styled";
import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";

import { getExpandedCollectionsById } from "metabase/entities/collections";

import colors from "metabase/lib/colors";

const COLLECTION_ICON_COLOR = colors["text-light"];

const isRoot = collection => collection.id === "root" || collection.id == null;

const getCollectionValue = collection =>
  collection.id === "root" ? null : collection.id;

export default class CollectionPicker extends React.Component {
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

    const collectionsById = getExpandedCollectionsById(collections);
    const collection = collectionsById[parentId];
    const crumbs = this._getCrumbs(collection, collectionsById);

    let items = (collection && collection.children) || [];

    // show root in itself
    if (collection && isRoot(collection)) {
      items = [collection, ...items];
    }

    return (
      <Box style={style} className={className}>
        <Box pb={1} mb={2} className="border-bottom">
          <Breadcrumbs crumbs={crumbs} />
        </Box>
        {items.map(collection => (
          <Box
            mt={1}
            p={1}
            onClick={() => onChange(getCollectionValue(collection))}
            className={cx(
              "bg-brand-hover text-white-hover cursor-pointer rounded",
              {
                "bg-brand text-white": value === getCollectionValue(collection),
              },
            )}
          >
            <Flex align="center">
              <Icon name="all" color={COLLECTION_ICON_COLOR} size={32} />
              <h4 className="mx1">{collection.name}</h4>
              {collection.children.length > 0 &&
                !isRoot(collection) && (
                  <Icon
                    name="chevronright"
                    className="p1 ml-auto circular text-grey-2 bordered bg-white-hover cursor-pointer"
                    onClick={e => {
                      e.stopPropagation();
                      this.setState({ parentId: collection.id });
                    }}
                  />
                )}
            </Flex>
          </Box>
        ))}
      </Box>
    );
  }
}
