import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useCallback } from "react";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Flex, Icon, Menu, Text, Tooltip } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import S from "./ModelActionListItem.module.css";

interface CodeBlockProps {
  children: ReactNode;
}

function CodeBlock({ children }: CodeBlockProps) {
  return (
    <Box
      component="pre"
      className={cx(CS.textMonospace, CS.textPreWrap)}
      p="lg"
      m={0}
      fz="xs"
      c="text-primary-inverse"
      bg="text-primary"
      bdrs="xs"
    >
      {children}
    </Box>
  );
}

interface QueryActionCardContentProps {
  action: WritebackQueryAction;
}

function QueryActionCardContent({ action }: QueryActionCardContentProps) {
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
    <Flex align="center" p="lg" bg="background_page-tertiary" bdrs="xs">
      <Text c="text-secondary">{t`Auto tracking schema`}</Text>
    </Flex>
  );
}

interface ModelActionListItemProps {
  action: WritebackAction;
  actionUrl: string;
  canRun: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onArchive: (action: WritebackAction) => void;
}

export function ModelActionListItem({
  action,
  actionUrl,
  canRun,
  canEdit,
  canArchive,
  onArchive,
}: ModelActionListItemProps) {
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
      <Flex align="flex-end" justify="space-between">
        <div>
          <Box
            component={Link}
            className={cx(CS.textDefault, CS.textBrandHover)}
            to={actionUrl}
            fz="1rem"
            fw={700}
          >
            {action.name}
          </Box>
          <Text mt="xxs" size="sm" fw={700} lh="0.875rem" c="text-secondary">
            {action.type === "implicit" && (
              <span className={S.dotSeparated}>{t`Basic action`}</span>
            )}
            {action.public_uuid && (
              <span className={S.dotSeparated}>{t`Public action form`}</span>
            )}
            {action.creator && (
              <span className={S.dotSeparated}>
                {t`Created by ${action.creator.common_name}`}
              </span>
            )}
          </Text>
        </div>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon aria-label={t`Actions`} variant="subtle">
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              component={ForwardRefLink}
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
      </Flex>
      <Box pos="relative" mt="md">
        {action.type === "query" ? (
          <QueryActionCardContent action={action} />
        ) : action.type === "implicit" ? (
          <ImplicitActionCardContent />
        ) : null}
        {canRun && (
          <>
            <Box pos="absolute" top="0.5rem" right="0.5rem">
              <Tooltip label={t`Run`}>
                <ActionIcon aria-label={t`Run`} onClick={openExecuteModal}>
                  <Icon name="play" />
                </ActionIcon>
              </Tooltip>
            </Box>
            <ActionExecuteModal
              opened={executeModalOpened}
              actionId={action.id}
              onClose={closeExecuteModal}
            />
          </>
        )}
      </Box>
      {confirmationModal}
    </>
  );
}
