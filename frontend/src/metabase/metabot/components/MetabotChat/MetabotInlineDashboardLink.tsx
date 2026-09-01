import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type {
  GeneratedAdhocDashboard,
  GeneratedDashboard,
} from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import {
  getSavedDashboardId,
  markDashboardSaved,
} from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import { Anchor, Button, Flex, Icon } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { SaveMetabotDashboardResponse } from "metabase-types/api";

import { MetabotSaveDashboardModal } from "./MetabotSaveDashboardModal";

export function MetabotInlineDashboardLink({
  value,
  readonly = false,
  conversationId,
}: {
  value: GeneratedDashboard;
  readonly?: boolean;
  conversationId: string;
}) {
  const savedDashboardId = useSelector((state) =>
    value.id != null ? getSavedDashboardId(state, value.id) : undefined,
  );
  const url =
    savedDashboardId != null
      ? Urls.dashboard({ id: savedDashboardId, name: value.title })
      : Urls.generatedDashboard(value);

  return (
    <Flex
      align="center"
      gap="sm"
      bd="1px solid var(--mb-color-border)"
      bdrs="md"
      p="md"
      data-testid="metabot-inline-dashboard-link"
    >
      <Icon name="dashboard" c="brand" />
      <Anchor
        component={ForwardRefLink}
        to={url}
        fw="bold"
        flex={1}
        miw={0}
        truncate
        aria-label={t`Open dashboard`}
      >
        {value.title}
      </Anchor>
      {"tiles" in value && !readonly && (
        <SaveDashboardAction
          dashboard={value}
          conversationId={conversationId}
          savedDashboardId={savedDashboardId}
        />
      )}
    </Flex>
  );
}

function SaveDashboardAction({
  dashboard,
  conversationId,
  savedDashboardId,
}: {
  dashboard: GeneratedAdhocDashboard;
  conversationId: string;
  savedDashboardId: number | undefined;
}) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [isSaveModalOpen, { open: openSaveModal, close: closeSaveModal }] =
    useDisclosure(false);

  const handleSaved = (saved: SaveMetabotDashboardResponse) => {
    dispatch(
      markDashboardSaved({ entityId: dashboard.id, dashboardId: saved.id }),
    );
    dispatch(
      addUndo({
        icon: "check_filled",
        message: t`Saved`,
        extraAction: {
          label: t`View`,
          action: () => navigate(Urls.dashboard(saved)),
        },
      }),
    );
    closeSaveModal();
  };

  if (savedDashboardId != null) {
    return (
      <Button
        component={ForwardRefLink}
        to={Urls.dashboard({ id: savedDashboardId, name: dashboard.title })}
        target="_blank"
        variant="subtle"
        color="text-secondary"
        size="compact-xs"
        leftSection={<Icon name="check" size={14} />}
      >
        {t`Saved`}
      </Button>
    );
  }

  return (
    <>
      <Button variant="subtle" size="compact-xs" onClick={openSaveModal}>
        {t`Save`}
      </Button>
      {isSaveModalOpen && (
        <MetabotSaveDashboardModal
          dashboard={dashboard}
          conversationId={conversationId}
          onSaved={handleSaved}
          onClose={closeSaveModal}
        />
      )}
    </>
  );
}
