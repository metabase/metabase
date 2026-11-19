import type { ReactNode } from "react";
import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

type ActionBreadcrumbsProps = {
  action: Pick<WritebackAction, "collection_id">;
  children?: ReactNode;
};

export function ActionBreadcrumbs({
  action,
  children,
}: ActionBreadcrumbsProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: action.collection_id,
    namespace: "data-actions",
  });
  const folderPath =
    path?.filter((collection) => !isRootCollection(collection)) ?? [];

  return (
    <DataStudioBreadcrumbs loading={isLoadingPath}>
      <Link to={Urls.dataStudioActions()}>{t`Data actions`}</Link>
      {folderPath.map((collection, index) => (
        <Link
          key={collection.id}
          to={Urls.dataStudioActions({
            expandedIds: folderPath.slice(0, index + 1).map(({ id }) => id),
          })}
        >
          {collection.name}
        </Link>
      ))}
      {children}
    </DataStudioBreadcrumbs>
  );
}
