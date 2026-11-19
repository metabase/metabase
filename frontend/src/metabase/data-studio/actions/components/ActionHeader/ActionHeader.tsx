import type { ReactNode } from "react";
import { t } from "ttag";

import { useUpdateActionMutation } from "metabase/api";
import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import {
  PaneHeader,
  PaneHeaderInput,
} from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { PLUGIN_DATA_TESTING, PLUGIN_DEPENDENCIES } from "metabase/plugins";
import type { StackProps } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { WritebackAction } from "metabase-types/api";

import { ACTION_NAME_MAX_LENGTH } from "../../constants";
import { ActionBreadcrumbs } from "../ActionBreadcrumbs";

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
  return (
    <PaneHeader
      title={<ActionNameInput action={action} />}
      icon="bolt"
      menu={
        !isEditMode && action.can_write && <ActionMoreMenu action={action} />
      }
      tabs={!isEditMode && <ActionTabs action={action} />}
      actions={actions}
      data-testid="action-header"
      breadcrumbs={
        <ActionBreadcrumbs action={action}>{action.name}</ActionBreadcrumbs>
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
  action: WritebackAction;
};

function ActionTabs({ action }: ActionTabsProps) {
  const actionId = action.id;
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
    ...(PLUGIN_DATA_TESTING.isEnabled && action.type === "query"
      ? [{ label: t`Tests`, to: Urls.dataStudioActionTestList(actionId) }]
      : []),
    ...(PLUGIN_DEPENDENCIES.isEnabled
      ? [
          {
            label: t`Dependencies`,
            to: Urls.dataStudioActionDependencies(actionId),
          },
        ]
      : []),
  ];
  return <PillTabNavigation tabs={tabs} />;
}
