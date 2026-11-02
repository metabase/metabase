import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { getDataStudioPageReturnState } from "metabase/common/data-studio/utils/return-to";
import { useLocation, useNavigate } from "metabase/router";
import { Button, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { Dashboard } from "metabase-types/api";

import { trackDataStudioDashboardEditStarted } from "../../analytics";
import { useCanEditDashboard } from "../../hooks/use-can-edit-dashboard";

type DashboardHeaderActionsProps = {
  dashboard: Dashboard;
};

export function DashboardHeaderActions({
  dashboard,
}: DashboardHeaderActionsProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const canEdit = useCanEditDashboard(dashboard);

  const handleEditClick = () => {
    trackDataStudioDashboardEditStarted(dashboard.id);
    navigate(Urls.dashboard(dashboard, { editMode: true }), {
      state: getDataStudioPageReturnState(location),
    });
  };

  return (
    <Group gap="sm" wrap="nowrap">
      <Button
        component={ForwardRefLink}
        to={Urls.dashboard(dashboard)}
        target="_blank"
        rightSection={<Icon name="external" />}
      >
        {c("A verb, not a noun").t`View`}
      </Button>
      {canEdit && (
        <Button leftSection={<Icon name="pencil" />} onClick={handleEditClick}>
          {t`Edit`}
        </Button>
      )}
    </Group>
  );
}
