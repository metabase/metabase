import { c, t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { useSelector } from "metabase/redux";
import { Button, Group, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import type { Dashboard } from "metabase-types/api";

import { trackDataStudioDashboardEditStarted } from "../../analytics";
import { useOpenDashboardEditor } from "../../hooks/use-open-dashboard-editor";

type DashboardHeaderActionsProps = {
  dashboard: Dashboard;
};

export function DashboardHeaderActions({
  dashboard,
}: DashboardHeaderActionsProps) {
  const openDashboardEditor = useOpenDashboardEditor();
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);
  const canEdit =
    dashboard.can_write && !dashboard.archived && !isRemoteSyncReadOnly;

  const handleEditClick = () => {
    trackDataStudioDashboardEditStarted(dashboard.id);
    openDashboardEditor(dashboard);
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
