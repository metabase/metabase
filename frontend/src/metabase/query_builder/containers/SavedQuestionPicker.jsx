import React from "react";
import Icon from "metabase/components/Icon";

import Collection from "metabase/entities/collections";
import CollectionsList from "metabase/collections/components/CollectionsList";

import {
  nonPersonalCollection,
  currentUserPersonalCollections,
  getParentPath,
} from "metabase/collections/utils";

function SavedQuestionPicker({ onBack, query, collections }) {
  console.log(collections);
  return (
    <div style={{ width: 400 }}>
      <div>
        <span
          onClick={() => onBack()}
          className="text-brand-hover flex align-center"
        >
          <Icon name="chevronleft" />
          Back
        </span>
      </div>
      <CollectionsList
        openCollections={[]}
        collections={collections}
        filter={nonPersonalCollection}
      />
    </div>
  );
}

export default Collection.loadList({
  query: () => ({ tree: true }),
})(SavedQuestionPicker);
