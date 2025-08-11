import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDashboardTitle } from "metabase/dashboard/hooks/use-dashboard-title";

export const DashboardTitle = ({ className }: { className?: string }) => {
  const [title, setTitle] = useDashboardTitle();
  const { dashboard } = useDashboardContext();

  if (!dashboard) {
    return null;
  }

  return (
    <EditableText
      className={className}
      key={title}
      initialValue={title}
      placeholder={t`Add title`}
      isDisabled={!dashboard?.can_write}
      data-testid="dashboard-name-heading"
      onChange={setTitle}
      maxLength={100}
    />
  );
};
