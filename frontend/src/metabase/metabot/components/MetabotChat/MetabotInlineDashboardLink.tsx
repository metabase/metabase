import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import type {
  GeneratedAdhocDashboard,
  GeneratedDashboard,
} from "metabase/api/ai-streaming/schemas";
import { ForwardRefLink } from "metabase/common/components/Link";
import { getSavedEntityId, markEntitySaved } from "metabase/metabot/state";
import { useDispatch, useSelector } from "metabase/redux";
import { addUndo } from "metabase/redux/undo";
import { useNavigate } from "metabase/router";
import {
  Anchor,
  Button,
  Center,
  Flex,
  Icon,
  Paper,
  Stack,
  Text,
} from "metabase/ui";
import * as Urls from "metabase/urls";
import type { SaveMetabotDashboardResponse } from "metabase-types/api";

import S from "./MetabotInlineDashboardLink.module.css";
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
    value.id != null ? getSavedEntityId(state, value.id) : undefined,
  );
  const url =
    savedDashboardId != null
      ? Urls.dashboard({ id: savedDashboardId, name: value.title })
      : Urls.generatedDashboard(value, conversationId);

  return (
    <Paper
      className={S.root}
      pos="relative"
      radius="lg"
      shadow="xs"
      bd="1px solid var(--mb-color-border-neutral)"
      p="xl"
      pr="xxl"
      data-testid="metabot-inline-dashboard-link"
    >
      <Flex align="center" gap="md">
        <Anchor
          className={S.link}
          component={ForwardRefLink}
          to={url}
          c="text-primary"
          underline="never"
          flex={1}
          miw={0}
          aria-label={t`Open dashboard`}
        >
          <Flex align="center" gap="md">
            <Center
              w={40}
              h={40}
              bdrs="50%"
              bg="background_surface-brand-subtle"
              c="core-brand"
              flex="0 0 auto"
            >
              <Icon name="dashboard" size={16} />
            </Center>
            <Stack gap="xxs" miw={0}>
              <Text fw="bold" size="lg" lh="20px" truncate>
                {value.title}
              </Text>
              <Text c="text-secondary" size="sm" lh="16px">
                {t`Dashboard`}
              </Text>
            </Stack>
          </Flex>
        </Anchor>
        {"dashcards" in value && !readonly && (
          <SaveDashboardAction
            dashboard={value}
            conversationId={conversationId}
            savedDashboardId={savedDashboardId}
          />
        )}
        <Icon name="external" size={16} c="icon-disabled" flex="0 0 auto" />
      </Flex>
    </Paper>
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
      markEntitySaved({
        conversationId,
        entityId: dashboard.id,
        savedId: saved.id,
      }),
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
        className={S.saveAction}
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
      <Button
        className={S.saveAction}
        variant="subtle"
        size="compact-xs"
        onClick={openSaveModal}
      >
        {t`Save`}
      </Button>
      {isSaveModalOpen && (
        <MetabotSaveDashboardModal
          conversationId={conversationId}
          dashboardId={dashboard.id}
          name={dashboard.title}
          description={dashboard.description}
          dashcards={dashboard.dashcards}
          onSaved={handleSaved}
          onClose={closeSaveModal}
        />
      )}
    </>
  );
}
