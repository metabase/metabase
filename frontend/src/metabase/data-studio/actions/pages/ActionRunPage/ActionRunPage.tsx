import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { TitleSection } from "metabase/common/data-studio/components/TitleSection";
import { Button, Center, Group, Icon, Tooltip } from "metabase/ui";

import { ActionHeader } from "../../components/ActionHeader";
import { useActionDatabase } from "../../hooks/use-action-database";
import { useRouteAction } from "../../hooks/use-route-action";

import { getRunDisabledReason } from "./utils";

export function ActionRunPage() {
  const {
    action,
    isLoading: isLoadingAction,
    error: actionError,
  } = useRouteAction();
  const {
    database,
    isLoading: isLoadingDatabase,
    error: databaseError,
  } = useActionDatabase(action);
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

  const disabledReason = getRunDisabledReason(database);

  return (
    <PageContainer data-testid="action-run">
      <ActionHeader action={action} />
      <TitleSection label={t`Run this action`}>
        <Group p="xl">
          <Tooltip label={disabledReason} disabled={disabledReason == null}>
            <Button
              variant="filled"
              leftSection={<Icon name="play_outlined" />}
              disabled={disabledReason != null}
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
