import type { ReactNode } from "react";
import { t } from "ttag";

import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { useCollectionPath } from "metabase/data-studio/common/hooks/use-collection-path/useCollectionPath";
import { useSelector } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
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
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: transform.collection_id,
    namespace: "transforms",
  });

  return (
    <PaneHeader
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
