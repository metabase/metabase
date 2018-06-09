import React from "react";
import cx from "classnames";

import { Box, Flex } from "rebass";
import Icon from "metabase/components/Icon";
import Breadcrumbs from "metabase/components/Breadcrumbs";

export const ROOT_COLLECTION = {
  id: null,
  name: "Saved Items",
  location: "",
};

const COLLECTION_ICON_COLOR = "#DCE1E4";

export default class CollectionPicker extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      parentId: "",
    };
  }

  // returns a list of "crumbs" starting with the "root" collection
  _getCrumbs(collection, collectionsById) {
    let crumbs = [
      [collectionsById[""].name, () => this.setState({ parentId: "" })],
    ];
    if (collection && collection.id != null) {
      crumbs = [
        ...crumbs,
        ...collection.path.map(id => [
          collectionsById[id].name,
          () => this.setState({ parentId: id }),
        ]),
        [collection.name],
      ];
    }
    return crumbs;
  }

  render() {
    const { value, onChange, collections, style, className } = this.props;
    const { parentId } = this.state;

    const collectionsById = getCollectionsById(collections);
    const collection = collectionsById[parentId || ""];
    const crumbs = this._getCrumbs(collection, collectionsById);

    return (
      <Box style={style} className={className}>
        <Box pb={1} mb={2} className="border-bottom">
          <Breadcrumbs crumbs={crumbs} />
        </Box>
        {collection &&
          collection.children.map(collection => (
            <Box
              mt={1}
              p={1}
              onClick={() => onChange(collection.id)}
              className={cx(
                "bg-brand-hover text-white-hover cursor-pointer rounded",
                {
                  "bg-brand text-white": value === collection.id,
                },
              )}
            >
              <Flex align="center">
                <Icon name="all" color={COLLECTION_ICON_COLOR} size={32} />
                <h4 className="mx1">{collection.name}</h4>
                {collection.children.length > 0 && (
                  <Icon
                    name="chevronright"
                    className="p1 ml-auto circular text-grey-2 border-grey-2 bordered bg-white-hover cursor-pointer"
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

// given list of collections with { id, name, location } returns a map of ids to
// expanded collection objects like { id, name, location, path, children }
// including a root collection with "" as the key
function getCollectionsById(collections) {
  const collectionsById = {};
  for (const c of collections.concat(ROOT_COLLECTION)) {
    collectionsById[c.id || ""] = {
      ...c,
      path: c.location.split("/").filter(l => l),
      children: [],
    };
  }
  collectionsById[""].children.push({
    name: "None",
    id: null,
    children: [],
  });
  // iterate over original collections so we don't include ROOT_COLLECTION as
  // a child of itself
  for (const { id } of collections) {
    const c = collectionsById[id];
    const parent = c.path[c.path.length - 1] || "";
    // need to ensure the parent collection exists, it may have been filtered
    // because we're selecting a collection's parent collection and it can't
    // contain itself
    if (collectionsById[parent]) {
      collectionsById[parent].children.push(c);
    }
  }
  return collectionsById;
}
