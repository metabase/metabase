import type { ReactNode } from "react";
import { t } from "ttag";

import { isRootCollection } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

import { ActionMoreMenu } from "./ActionMoreMenu";
import { ActionNameInput } from "./ActionNameInput";
import { ActionTabs } from "./ActionTabs";

type ActionHeaderProps = {
  action: WritebackAction;
  actions?: ReactNode;
  isEditMode?: boolean;
  readOnly?: boolean;
};

export function ActionHeader({
  action,
  actions,
  isEditMode = false,
  readOnly,
}: ActionHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: action.collection_id,
  });

  return (
    <PaneHeader
      title={<ActionNameInput action={action} readOnly={readOnly} />}
      icon="bolt"
      menu={
        !isEditMode && <ActionMoreMenu action={action} readOnly={readOnly} />
      }
      tabs={!isEditMode && <ActionTabs actionId={action.id} />}
      actions={actions}
      data-testid="action-header"
      breadcrumbs={
        <DataStudioBreadcrumbs loading={isLoadingPath}>
          <Link to={Urls.dataActionList()}>{t`Data actions`}</Link>
          {path
            ?.filter((collection) => !isRootCollection(collection))
            .map((collection) => (
              <Link
                key={collection.id}
                to={Urls.dataActionList({ collectionId: collection.id })}
              >
                {collection.name}
              </Link>
            ))}
          {action.name}
        </DataStudioBreadcrumbs>
      }
    />
  );
}
