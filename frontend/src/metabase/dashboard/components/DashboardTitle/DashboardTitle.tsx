import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/common/utils/dashboard";
import { useTranslateContent } from "metabase/content-translation/hooks";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDashboardTitle } from "metabase/dashboard/hooks/use-dashboard-title";

export const DashboardTitle = ({ className }: { className?: string }) => {
  const [title, setTitle] = useDashboardTitle();
  const { dashboard, isEditableDashboard } = useDashboardContext();
  const tc = useTranslateContent();

  if (!dashboard) {
    return null;
  }

  return (
    <EditableText
      className={className}
      key={title}
      initialValue={tc(title)}
      placeholder={t`Add title`}
      isDisabled={!isEditableDashboard}
      data-testid="dashboard-name-heading"
      onChange={setTitle}
      maxLength={DASHBOARD_NAME_MAX_LENGTH}
    />
  );
};
