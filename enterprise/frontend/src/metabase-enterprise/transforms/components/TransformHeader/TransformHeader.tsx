import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import type { StackProps } from "metabase/ui";
import { DataStudioBreadcrumbs } from "metabase-enterprise/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { useCollectionPath } from "metabase-enterprise/data-studio/common/hooks/use-collection-path/useCollectionPath";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Transform } from "metabase-types/api";

import { TransformMoreMenu } from "./TransformMoreMenu";
import { TransformNameInput } from "./TransformNameInput";
import { TransformTabs } from "./TransformTabs";

type TransformHeaderProps = {
  actions?: ReactNode;
  hasMenu?: boolean;
  isEditMode?: boolean;
  transform: Transform;
} & Omit<StackProps, "title">;

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
  isEditMode = false,
  ...restProps
}: TransformHeaderProps) {
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: transform.collection_id,
    namespace: "transforms",
  });

  return (
    <PaneHeader
      title={<TransformNameInput transform={transform} />}
      icon="transform"
      menu={
        hasMenu && (
          <TransformMoreMenu
            readOnly={isRemoteSyncReadOnly}
            transform={transform}
          />
        )
      }
      tabs={!isEditMode && <TransformTabs transform={transform} />}
      actions={actions}
      data-testid="transforms-header"
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          <Link to={Urls.transformList()}>{t`Transforms`}</Link>
          {path?.map((folder) => (
            <Link
              key={folder.id}
              to={`${Urls.transformList()}?collectionId=${folder.id}`}
            >
              {folder.name}
            </Link>
          ))}
          {transform.name}
        </DataStudioBreadcrumbs>
      }
      showMetabotButton
      {...restProps}
    />
  );
}
