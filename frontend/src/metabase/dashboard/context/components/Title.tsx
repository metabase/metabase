import { useCallback } from "react";
import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useSetDashboardAttributeHandler } from "metabase/dashboard/components/Dashboard/use-set-dashboard-attribute";

import { useDashboardContext } from "../context";

export const Title = ({ className }: { className?: string }) => {
  const { dashboard, isEditing, updateDashboard } = useDashboardContext();

  const setDashboardAttribute = useSetDashboardAttributeHandler();

  const handleUpdateCaption = useCallback(
    async (name: string) => {
      await setDashboardAttribute("name", name);
      if (!isEditing) {
        await updateDashboard({ attributeNames: ["name"] });
      }
    },
    [setDashboardAttribute, isEditing, updateDashboard],
  );

  if (!dashboard) {
    return null;
  }

  return (
    <EditableText
      className={className}
      key={dashboard.name}
      initialValue={dashboard.transient_name ?? dashboard.name}
      placeholder={t`Add title`}
      isDisabled={!dashboard.can_write}
      data-testid="dashboard-name-heading"
      onChange={handleUpdateCaption}
      maxLength={100}
    />
  );
};
