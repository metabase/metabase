import type { ChangeEvent } from "react";
import { t } from "ttag";

import { useUpdateDashboardMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataToasts } from "metabase/common/hooks";
import { useUniqueId } from "metabase/common/hooks/use-unique-id";
import { trackAutoApplyFiltersDisabled } from "metabase/dashboard/analytics";
import { Switch } from "metabase/ui";
import type { Dashboard } from "metabase-types/api";

import { useCanEditDashboard } from "../../../hooks/use-can-edit-dashboard";

import { DashboardStat } from "./DashboardStat";

type AutoApplyFiltersStatProps = {
  dashboard: Pick<
    Dashboard,
    "id" | "auto_apply_filters" | "can_write" | "archived"
  >;
};

export function AutoApplyFiltersStat({ dashboard }: AutoApplyFiltersStatProps) {
  const labelId = useUniqueId();
  const canEdit = useCanEditDashboard(dashboard);
  const [updateDashboard, { isLoading: isUpdating }] =
    useUpdateDashboardMutation();
  const { sendErrorToast } = useMetadataToasts();

  if (!canEdit) {
    return (
      <DashboardStat
        label={t`Auto-apply filters`}
        value={dashboard.auto_apply_filters ? t`On` : t`Off`}
      />
    );
  }

  const handleChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const isEnabled = event.currentTarget.checked;
    try {
      await updateDashboard({
        id: dashboard.id,
        auto_apply_filters: isEnabled,
      }).unwrap();
      if (!isEnabled) {
        trackAutoApplyFiltersDisabled(dashboard.id);
      }
    } catch (error) {
      sendErrorToast(
        getErrorMessage(error, t`Failed to update auto-apply filters`),
      );
    }
  };

  return (
    <DashboardStat
      label={t`Auto-apply filters`}
      labelId={labelId}
      value={
        <Switch
          aria-labelledby={labelId}
          checked={dashboard.auto_apply_filters}
          disabled={isUpdating}
          onChange={handleChange}
        />
      }
    />
  );
}
