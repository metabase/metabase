import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { Button, Center, Group, Icon, Tooltip } from "metabase/ui";

import { ActionHeader } from "../../components/ActionHeader";
import { useActionDatabases } from "../../hooks/use-action-databases";
import { useRouteAction } from "../../hooks/use-route-action";

export function ActionRunPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    databases,
    isLoading: isLoadingDatabases,
    error: databasesError,
  } = useActionDatabases();
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const isLoading = isLoadingAction || isLoadingDatabases;
  const error = actionError ?? databasesError;

  if (isLoading || error != null || action == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  const canRun = databases.some(
    (database) => database.id === action.database_id,
  );

  return (
    <PageContainer data-testid="action-run">
      <ActionHeader action={action} />
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
