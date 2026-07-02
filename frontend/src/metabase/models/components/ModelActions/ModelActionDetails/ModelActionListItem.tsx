import { useDisclosure } from "@mantine/hooks";
import { useCallback } from "react";
import { Link as RouterLink } from "react-router";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import {
  ActionCardContainer,
  ActionHeader,
  ActionRunButtonContainer,
  ActionSubtitle,
  ActionSubtitlePart,
  ActionTitle,
  CodeBlock,
  ImplicitActionCardContentRoot,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  actionUrl: string;
  canRun: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onArchive: (action: WritebackAction) => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  const question = Question.create({ dataset_query: action.dataset_query });
  if (!question.isNative()) {
    return (
      <CodeBlock>
        <Icon name="warning" tooltip={t`No query found`} />
      </CodeBlock>
    );
  }

  const query = question.query();
  const queryText = Lib.rawNativeQuery(query);

  return <CodeBlock>{queryText}</CodeBlock>;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <div>{t`Auto tracking schema`}</div>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({
  action,
  actionUrl,
  canRun,
  canEdit,
  canArchive,
  onArchive,
}: Props) {
  const { show: askConfirmation, modalContent: confirmationModal } =
    useConfirmation();
  const [
    executeModalOpened,
    { open: openExecuteModal, close: closeExecuteModal },
  ] = useDisclosure(false);

  const handleArchive = useCallback(() => {
    askConfirmation({
      title: t`Archive ${action.name}?`,
      confirmButtonText: t`Archive`,
      onConfirm: () => onArchive(action),
    });
  }, [action, askConfirmation, onArchive]);

  return (
    <>
      <ActionHeader>
        <div>
          <ActionTitle to={actionUrl}>{action.name}</ActionTitle>
          <ActionSubtitle>
            {action.type === "implicit" && (
              <ActionSubtitlePart>{t`Basic action`}</ActionSubtitlePart>
            )}
            {action.public_uuid && (
              <ActionSubtitlePart>{t`Public action form`}</ActionSubtitlePart>
            )}
            {action.creator && (
              <ActionSubtitlePart>
                {t`Created by ${action.creator.common_name}`}
              </ActionSubtitlePart>
            )}
          </ActionSubtitle>
        </div>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon aria-label={t`Actions`} variant="subtle">
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              component={RouterLink}
              data-testid="entity-menu-link"
              leftSection={
                <Icon name={canEdit ? "pencil" : "eye"} aria-hidden />
              }
              to={actionUrl}
            >
              {canEdit ? t`Edit` : t`View`}
            </Menu.Item>
            {canArchive && (
              <Menu.Item
                leftSection={<Icon name="archive" aria-hidden />}
                onClick={handleArchive}
              >
                {t`Archive`}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </ActionHeader>
      <ActionCardContainer>
        {action.type === "query" ? (
          <QueryActionCardContent action={action} />
        ) : action.type === "implicit" ? (
          <ImplicitActionCardContent />
        ) : null}
        {canRun && (
          <>
            <ActionRunButtonContainer>
              <Tooltip label={t`Run`}>
                <ActionIcon
                  variant="subtle"
                  bg="background_page-primary"
                  c="text-primary"
                  aria-label={t`Run`}
                  onClick={openExecuteModal}
                >
                  <Icon name="play" />
                </ActionIcon>
              </Tooltip>
            </ActionRunButtonContainer>
            <ActionExecuteModal
              opened={executeModalOpened}
              actionId={action.id}
              onClose={closeExecuteModal}
            />
          </>
        )}
      </ActionCardContainer>
      {confirmationModal}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionListItem;
