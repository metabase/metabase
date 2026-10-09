import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import { isRootCollection } from "metabase/common/collections/utils";
import { Link } from "metabase/common/components/Link";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useCollectionPath } from "metabase/common/data-studio/hooks/use-collection-path/useCollectionPath";
import { useMetadataToasts } from "metabase/common/hooks";
import type { StackProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackAction, WritebackActionId } from "metabase-types/api";

import { ACTION_NAME_MAX_LENGTH } from "../../constants";

import { ActionMoreMenu } from "./ActionMoreMenu";

type ActionHeaderProps = {
  action: WritebackAction;
  actions?: ReactNode;
  isEditMode?: boolean;
} & Omit<StackProps, "title">;

export function ActionHeader({
  action,
  actions,
  isEditMode = false,
  ...stackProps
}: ActionHeaderProps) {
  const { path, isLoadingPath } = useCollectionPath({
    collectionId: action.collection_id,
    namespace: "data-actions",
  });
  const folderPath =
    path?.filter((collection) => !isRootCollection(collection)) ?? [];

  return (
    <PaneHeader
      title={<ActionNameInput action={action} />}
      icon="bolt"
      menu={
        !isEditMode && action.can_write && <ActionMoreMenu action={action} />
      }
      tabs={!isEditMode && <ActionTabs actionId={action.id} />}
      actions={actions}
      data-testid="action-header"
      breadcrumbs={
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
          {action.name}
        </DataStudioBreadcrumbs>
      }
      {...stackProps}
    />
  );
}

type ActionNameInputProps = {
  action: WritebackAction;
};

function ActionNameInput({ action }: ActionNameInputProps) {
  const [updateAction] = useUpdateActionMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (name: string) => {
    const { error } = await updateAction({ id: action.id, name });
    if (error) {
      sendErrorToast(t`Failed to update action name`);
    } else {
      sendSuccessToast(t`Action name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={action.name}
      maxLength={ACTION_NAME_MAX_LENGTH}
      readOnly={!action.can_write}
      onChange={handleChangeName}
    />
  );
}

type ActionTabsProps = {
  actionId: WritebackActionId;
};

function ActionTabs({ actionId }: ActionTabsProps) {
  const tabs: PillTab[] = [
    { label: t`Definition`, to: Urls.dataStudioAction(actionId) },
    {
      label: t`Fields`,
      to: Urls.dataStudioActionFields(actionId),
      isSelected: (pathname: string) =>
        pathname.startsWith(Urls.dataStudioActionFields(actionId)),
    },
    { label: t`Run`, to: Urls.dataStudioActionRun(actionId) },
    { label: t`Settings`, to: Urls.dataStudioActionSettings(actionId) },
  ];
  return <PillTabNavigation tabs={tabs} />;
}
