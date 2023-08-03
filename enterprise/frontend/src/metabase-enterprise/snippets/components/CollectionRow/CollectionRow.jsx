/* eslint-disable react/prop-types */
import { Component } from "react";

import { Icon } from "metabase/core/components/Icon";
import SnippetCollections from "metabase/entities/snippet-collections";

import CollectionOptionsButton from "../CollectionOptionsButton";
import { CollectionRowRoot } from "./CollectionRow.styled";

const ICON_SIZE = 16;

class CollectionRow extends Component {
  render() {
    const { snippetCollection: collection, setSnippetCollectionId } =
      this.props;
    const onSelectCollection = () => setSnippetCollectionId(collection.id);

    return (
      <CollectionRowRoot
        isArchived={collection.archived}
        className="hover-parent hover--visibility"
        {...(collection.archived ? undefined : { onClick: onSelectCollection })}
      >
        <Icon name="folder" size={ICON_SIZE} style={{ opacity: 0.25 }} />
        <span className="flex-full ml1 text-bold">{collection.name}</span>
        <CollectionOptionsButton {...this.props} collection={collection} />
      </CollectionRowRoot>
    );
  }
}

export default SnippetCollections.load({
  id: (state, props) => props.item.id,
  wrapped: true,
})(CollectionRow);
