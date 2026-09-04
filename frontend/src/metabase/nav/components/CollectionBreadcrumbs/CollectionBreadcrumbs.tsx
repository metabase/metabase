import { useTranslateContent } from "metabase/content-translation/hooks";
import * as Urls from "metabase/urls";
import type {
  Collection,
  CollectionEssentials,
  CollectionId,
  Dashboard,
} from "metabase-types/api";

import { CollectionBreadcrumbsView } from "./CollectionBreadcrumbsView";
import { collectionToCrumbs } from "./utils";

export interface CollectionBreadcrumbsProps {
  collection?: Collection;
  dashboard?: Dashboard;
  onClick?: (collection: CollectionEssentials) => void;
  baseCollectionId: CollectionId | null;
}

export const CollectionBreadcrumbs = ({
  collection,
  dashboard,
  onClick,
  baseCollectionId = null,
}: CollectionBreadcrumbsProps): JSX.Element | null => {
  const tc = useTranslateContent();

  if (!collection) {
    return null;
  }

  return (
    <CollectionBreadcrumbsView
      path={collectionToCrumbs({ collection, baseCollectionId, onClick })}
      terminal={
        dashboard
          ? {
              kind: "static",
              key: `dashboard-${dashboard.id}`,
              icon: "dashboard",
              label: tc(dashboard.name),
              to: Urls.dashboard(dashboard),
            }
          : undefined
      }
    />
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CollectionBreadcrumbs;
