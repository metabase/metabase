import Collections from "metabase/entities/collections";
import { getCollectionId } from "metabase/selectors/app";
import { State } from "metabase-types/store";
import CollectionBreadcrumbs from "../../components/CollectionBreadcrumbs";

const collectionProps = {
  id: (state: State) => getCollectionId(state) ?? "root",
  loadingAndErrorWrapper: false,
  properties: ["name", "authority_level"],
};

export default Collections.load(collectionProps)(CollectionBreadcrumbs);
