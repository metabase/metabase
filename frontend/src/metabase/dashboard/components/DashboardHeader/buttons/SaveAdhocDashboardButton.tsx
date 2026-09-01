import { useDisclosure } from "@mantine/hooks";
import { useMemo } from "react";
import { t } from "ttag";

import { useDashboardContext } from "metabase/dashboard/context";
import { getAdhocDashboardDefinition } from "metabase/dashboard/utils";
import { MetabotSaveDashboardModal, markEntitySaved } from "metabase/metabot";
import { useDispatch } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { Button } from "metabase/ui";
import * as Urls from "metabase/urls";
import { isAdhocDashboardId } from "metabase/utils/dashboard";
import type { SaveMetabotDashboardResponse } from "metabase-types/api";

export const SaveAdhocDashboardButton = () => {
  const { dashboard } = useDashboardContext();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  const dashboardId = dashboard?.id;
  const definition = useMemo(
    () =>
      isAdhocDashboardId(dashboardId)
        ? getAdhocDashboardDefinition(dashboardId)
        : undefined,
    [dashboardId],
  );

  if (definition?.metabot == null) {
    return null;
  }
  const { metabot } = definition;

  const handleSaved = (saved: SaveMetabotDashboardResponse) => {
    dispatch(
      markEntitySaved({ entityId: metabot.dashboard_id, savedId: saved.id }),
    );
    closeSaveModal();
    navigate(Urls.dashboard(saved));
  };

  return (
    <>
      <Button
        variant="filled"
        onClick={openSaveModal}
        data-testid="save-adhoc-dashboard-button"
      >
        {t`Save`}
      </Button>
      {isSaveModalOpen && (
        <MetabotSaveDashboardModal
          conversationId={metabot.conversation_id}
          dashboardId={metabot.dashboard_id}
          name={definition.name}
          description={definition.description}
          tiles={definition.tiles}
          onSaved={handleSaved}
          onClose={closeSaveModal}
        />
      )}
    </>
  );
};
