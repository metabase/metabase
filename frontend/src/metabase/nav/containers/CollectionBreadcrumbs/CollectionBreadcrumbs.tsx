import Collections from "metabase/entities/collections";
import { getCollectionId } from "metabase/selectors/app";
import type { State } from "metabase-types/store";

import CollectionBreadcrumbs from "../../components/CollectionBreadcrumbs";

const collectionProps = {
  id: (state: State) => getCollectionId(state) ?? "root",
  loadingAndErrorWrapper: false,
  properties: ["name", "authority_level"],
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Collections.load(collectionProps)(CollectionBreadcrumbs);
