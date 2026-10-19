import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import {
  PaneHeaderInput,
  PanelHeaderTitle,
} from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/common/utils/dashboard";
import type { Dashboard } from "metabase-types/api";

import { useCanEditDashboard } from "../../hooks/use-can-edit-dashboard";

type DashboardNameInputProps = {
  dashboard: Pick<Dashboard, "id" | "name" | "can_write" | "archived">;
};

export function DashboardNameInput({ dashboard }: DashboardNameInputProps) {
  const canEdit = useCanEditDashboard(dashboard);
  const [updateDashboard] = useUpdateDashboardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  if (!canEdit) {
    return <PanelHeaderTitle>{dashboard.name}</PanelHeaderTitle>;
  }

  const handleChangeName = async (newName: string) => {
    const { error } = await updateDashboard({
      id: dashboard.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update dashboard name`);
    } else {
      sendSuccessToast(t`Dashboard name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={dashboard.name}
      maxLength={DASHBOARD_NAME_MAX_LENGTH}
      data-testid="dashboard-name-input"
      onChange={handleChangeName}
    />
  );
}
