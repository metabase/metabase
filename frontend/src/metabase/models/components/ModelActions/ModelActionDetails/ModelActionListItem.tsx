import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { type ReactNode, useCallback } from "react";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { ForwardRefLink, Link } from "metabase/common/components/Link";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { ActionIcon, Box, Flex, Icon, Menu, Tooltip, rem } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import S from "./ModelActionListItem.module.css";

interface Props {
  action: WritebackAction;
  actionUrl: string;
  canRun: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onArchive: (action: WritebackAction) => void;
}

function CodeBlock({ children }: { children: ReactNode }) {
  return (
    <Box
      component="pre"
      className={cx(S.actionCard, S.codeBlock)}
      p="lg"
      m={0}
      fz="xs"
      c="text-primary-inverse"
      bg="text-primary"
    >
      {children}
    </Box>
  );
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
    <Flex
      className={S.actionCard}
      align="center"
      p="lg"
      c="text-secondary"
      bg="background_page-tertiary"
      fw={400}
    >
      <div>{t`Auto tracking schema`}</div>
    </Flex>
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
      <Flex align="flex-end" justify="space-between">
        <div>
          <Link className={S.actionTitle} to={actionUrl}>
            {action.name}
          </Link>
          <Box
            component="span"
            display="block"
            mt="xxs"
            fz="sm"
            fw={700}
            lh="0.875rem"
            c="text-secondary"
          >
            {action.type === "implicit" && (
              <span className={S.actionSubtitlePart}>{t`Basic action`}</span>
            )}
            {action.public_uuid && (
              <span
                className={S.actionSubtitlePart}
              >{t`Public action form`}</span>
            )}
            {action.creator && (
              <span className={S.actionSubtitlePart}>
                {t`Created by ${action.creator.common_name}`}
              </span>
            )}
          </Box>
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
            <Box pos="absolute" top={rem(8)} right={rem(8)}>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionListItem;
