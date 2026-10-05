import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { skipToken, useGetDatabaseQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { hasActionsEnabled } from "metabase/common/utils/database";
import { Button, Center, Group, Icon, Tooltip } from "metabase/ui";

import { ActionHeader } from "../../components/ActionHeader";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionRunPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const databaseId = action?.database_id;
  const {
    data: database,
    isLoading: isLoadingDatabase,
    error: databaseError,
  } = useGetDatabaseQuery(databaseId != null ? { id: databaseId } : skipToken);
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const isLoading = isLoadingAction || isLoadingDatabase;
  const error = actionError ?? databaseError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const canRun = database != null && hasActionsEnabled(database);

  return (
    <PageContainer data-testid="action-run">
      <ActionHeader action={action} readOnly={!action.can_write} />
      <TitleSection label={t`Run this action`}>
        <Group p="xl">
          <Tooltip
            label={t`Actions are disabled for this action's database.`}
            disabled={canRun}
          >
            <Button
              variant="filled"
              leftSection={<Icon name="play_outlined" />}
              disabled={!canRun}
              onClick={openModal}
            >
              {t`Run`}
            </Button>
          </Tooltip>
        </Group>
      </TitleSection>
      <ActionExecuteModal
        opened={isModalOpened}
        actionId={action.id}
        onClose={closeModal}
      />
    </PageContainer>
  );
}
