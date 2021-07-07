/* eslint-disable react/prop-types */
import React from "react";
import cx from "classnames";

import Icon from "metabase/components/Icon";
import SnippetCollections from "metabase/entities/snippet-collections";

import CollectionOptionsButton from "./CollectionOptionsButton";

const ICON_SIZE = 16;

@SnippetCollections.load({ id: (state, props) => props.item.id, wrapped: true })
export default class CollectionRow extends React.Component {
  render() {
    const {
      snippetCollection: collection,
      setSnippetCollectionId,
    } = this.props;
    const onSelectCollection = () => setSnippetCollectionId(collection.id);

    return (
      <div
        className={cx(
          { "bg-light-hover cursor-pointer": !collection.archived },
          "hover-parent hover--visibility flex align-center py2 px3 text-brand",
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
