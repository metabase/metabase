import { t } from "ttag";

import { EditableText } from "metabase/common/components/EditableText";
import { DASHBOARD_NAME_MAX_LENGTH } from "metabase/dashboard/constants";
import { useDashboardContext } from "metabase/dashboard/context";
import { useDashboardTitle } from "metabase/dashboard/hooks/use-dashboard-title";
import { useTranslateContent } from "metabase/i18n/hooks";

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
