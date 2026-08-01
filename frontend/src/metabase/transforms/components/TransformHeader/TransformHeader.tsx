import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useIsTransformSyncReadOnly } from "metabase/transforms/hooks/use-is-transform-sync-read-only";
import { useTransformHost } from "metabase/transforms/host";
import type { StackProps } from "metabase/ui";
import type { Transform } from "metabase-types/api";

import { TransformMoreMenu } from "./TransformMoreMenu";
import { TransformNameInput } from "./TransformNameInput";
import { TransformTabs } from "./TransformTabs";

type TransformHeaderProps = {
  actions?: ReactNode;
  hasMenu?: boolean;
  isEditMode?: boolean;
  readOnly?: boolean;
  transform: Transform;
} & Omit<StackProps, "title">;

export function TransformHeader({
  transform,
  actions,
  hasMenu = true,
  isEditMode = false,
  readOnly,
  ...restProps
}: TransformHeaderProps) {
  const host = useTransformHost();
  const isRemoteSyncReadOnly = useIsTransformSyncReadOnly(transform);
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: transform.collection_id,
    namespace: "transforms",
  });

  return (
    <PaneHeader
      showAppSwitcher={!host.hasHostChrome}
      title={<TransformNameInput transform={transform} readOnly={readOnly} />}
      icon="transform"
      menu={
        hasMenu && (
          <TransformMoreMenu
            readOnly={readOnly || isRemoteSyncReadOnly}
            transform={transform}
          />
        )
      }
      tabs={!isEditMode && <TransformTabs transform={transform} />}
      actions={actions}
      data-testid="transforms-header"
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          <Link to={host.rootUrl}>{t`Transforms`}</Link>
          {path?.map((folder) => {
            const folderUrl = host.getFolderUrl?.(folder.id);
            return folderUrl != null ? (
              <Link key={folder.id} to={folderUrl}>
                {folder.name}
              </Link>
            ) : (
              folder.name
            );
          })}
          {transform.name}
        </DataStudioBreadcrumbs>
      }
      showMetabotButton
      {...restProps}
    />
  );
}
