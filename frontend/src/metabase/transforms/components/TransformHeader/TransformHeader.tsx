import type { ReactNode } from "react";
import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useWorktreeId } from "metabase/common/worktrees";
import { PLUGIN_REMOTE_SYNC } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import type { StackProps } from "metabase/ui";
import * as Urls from "metabase/urls";
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
  const worktreeId = useWorktreeId();
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
          <Link to={Urls.transformList({ worktreeId })}>{t`Transforms`}</Link>
          {/* the root transforms collection is the hardcoded crumb above, so keep only real folders */}
          {path
            ?.filter((folder) => !isRootCollection(folder))
            .map((folder) => (
              <Link
                key={folder.id}
                to={Urls.transformList({ worktreeId, collectionId: folder.id })}
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
