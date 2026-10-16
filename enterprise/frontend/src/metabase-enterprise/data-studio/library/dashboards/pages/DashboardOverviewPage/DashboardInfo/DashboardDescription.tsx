import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import { EditableText } from "metabase/common/components/EditableText";
import { Markdown } from "metabase/common/components/Markdown";
import { useMetadataToasts } from "metabase/common/hooks";
import { DASHBOARD_DESCRIPTION_MAX_LENGTH } from "metabase/common/utils/dashboard";
import { Text } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useCanEditDashboard } from "../../../hooks/use-can-edit-dashboard";

type DashboardDescriptionProps = {
  dashboard: Pick<Dashboard, "id" | "description" | "can_write" | "archived">;
};

export function DashboardDescription({ dashboard }: DashboardDescriptionProps) {
  const canEdit = useCanEditDashboard(dashboard);
  const [updateDashboard] = useUpdateDashboardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  if (!canEdit) {
    return dashboard.description ? (
      <Markdown>{dashboard.description}</Markdown>
    ) : (
      <Text c="text-secondary">{t`No description`}</Text>
    );
  }

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateDashboard({
      id: dashboard.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(t`Failed to update dashboard description`);
    } else {
      sendSuccessToast(t`Dashboard description updated`);
    }
  };

  return (
    <EditableText
      initialValue={dashboard.description ?? ""}
      placeholder={t`No description`}
      maxLength={DASHBOARD_DESCRIPTION_MAX_LENGTH}
      isMarkdown
      isOptional
      isMultiline
      data-testid="dashboard-description-input"
      onChange={handleChange}
    />
  );
}
