/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";

import CS from "metabase/css/core/index.css";
import SnippetCollections from "metabase/entities/snippet-collections";
import { Icon } from "metabase/ui";

import CollectionOptionsButton from "./CollectionOptionsButton";

const ICON_SIZE = 16;

class CollectionRow extends Component {
  render() {
    const { snippetCollection: collection, setSnippetCollectionId } =
      this.props;
    const onSelectCollection = () => setSnippetCollectionId(collection.id);

    return (
      <div
        className={cx(
          { "bg-light-hover cursor-pointer": !collection.archived },
          "hover-parent hover--visibility",
          CS.flex,
          CS.alignCenter,
          CS.py2,
          CS.px3,
          CS.textBrand,
        )}
        {...(collection.archived ? undefined : { onClick: onSelectCollection })}
      >
        <Icon name="folder" size={ICON_SIZE} style={{ opacity: 0.25 }} />
        <span className="flex-full ml1 text-bold">{collection.name}</span>
        <CollectionOptionsButton {...this.props} collection={collection} />
      </div>
    );
  }
}

export default SnippetCollections.load({
  id: (state, props) => props.item.id,
  wrapped: true,
})(CollectionRow);
