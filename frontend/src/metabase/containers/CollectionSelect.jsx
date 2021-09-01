/* eslint-disable react/prop-types */
import Collection from "metabase/entities/collections";

import ItemSelect from "./ItemSelect";
import CollectionPicker from "./CollectionPicker";
import CollectionName from "./CollectionName";

const CollectionSelect = ItemSelect(
  CollectionPicker,
  CollectionName,
  "collection",
);

/**
 * When suggesting an initial collection,
 * we need to check a user has `write` access to it.
 * For that, collection objects have to be present in Redux store,
 * so we can retrieve a collection by ID and check the `can_write` flag.
 *
 * This component is wrapped with @Collection.loadList
 * to ensure collection are fetched and permissions can be checked.
 */
export default Collection.loadList({
  loadingAndErrorWrapper: false,
})(CollectionSelect);
