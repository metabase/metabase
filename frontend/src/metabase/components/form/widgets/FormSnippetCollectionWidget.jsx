/* eslint-disable react/prop-types */
import React from "react";

import ItemSelect from "metabase/containers/ItemSelect";
import CollectionPicker from "metabase/containers/CollectionPicker";
import { ROOT_COLLECTION } from "metabase/entities/collections";
import SnippetCollections from "metabase/entities/snippet-collections";

const CollectionSelect = ItemSelect(
  CollectionPicker,
  SnippetCollections.Name,
  "collection",
);

const FormSnippetCollectionWidget = ({ field }) => (
  <CollectionSelect
    entity={SnippetCollections}
    showSearch={false} // seems that search endpoint doesn't support namespace yet
    {...field}
    value={field.value || ROOT_COLLECTION.id} // needed so SnippetCollections.Name finds the right collection
  />
);
export default FormSnippetCollectionWidget;
