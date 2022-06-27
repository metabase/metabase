import Collections from "metabase/entities/collections";
import { CollectionId } from "metabase-types/api";
import { State } from "metabase-types/store";
import PathBreadcrumbs from "../../components/PathBreadcrumbs";

export interface PathBreadcrumbsProps {
  collectionId: CollectionId;
}

const collectionProps = {
  id: (state: State, { collectionId }: PathBreadcrumbsProps) =>
    collectionId ?? "root",
  loadingAndErrorWrapper: false,
  properties: ["name", "authority_level"],
};

export default Collections.load(collectionProps)(PathBreadcrumbs);
