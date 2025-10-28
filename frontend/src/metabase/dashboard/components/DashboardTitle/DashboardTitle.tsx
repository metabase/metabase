import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDashboardTitle } from "metabase/dashboard/hooks/use-dashboard-title";

export const DashboardTitle = ({ className }: { className?: string }) => {
  const [title, setTitle] = useDashboardTitle();
  const { dashboard, hasEditAction } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  const canEditTitle = hasEditAction && Boolean(dashboard?.can_write);

  return (
    <EditableText
      className={className}
      key={title}
      initialValue={title}
      placeholder={t`Add title`}
      isDisabled={!canEditTitle}
      data-testid="dashboard-name-heading"
      onChange={setTitle}
      maxLength={DASHBOARD_NAME_MAX_LENGTH}
    />
  );
};
