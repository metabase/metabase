import { useDisclosure } from "@mantine/hooks";
import { useCallback, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { EntityMenuTrigger } from "metabase/common/components/EntityMenuTrigger";
import { Link } from "metabase/common/components/Link";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import { Icon, Menu } from "metabase/ui";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type {
  IconName,
  WritebackAction,
  WritebackQueryAction,
} from "metabase-types/api";

import {
  ActionCardContainer,
  ActionHeader,
  ActionRunButton,
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

type ModelActionMenuItem = {
  title: string;
  icon: IconName;
  link?: string;
  action?: () => void;
};

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  const question = Question.create({ dataset_query: action.dataset_query });
  if (!question.isNative()) {
    return (
      <CodeBlock>
        <Icon name="warning" size={16} tooltip={t`No query found`} />
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

  const [menuOpened, setMenuOpened] = useState(false);

  const closeMenu = useCallback(() => {
    setMenuOpened(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setMenuOpened((opened) => !opened);
  }, []);

  const menuItems = useMemo<(ModelActionMenuItem | null)[]>(
    () => [
      {
        title: canEdit ? t`Edit` : t`View`,
        icon: canEdit ? "pencil" : "eye",
        link: actionUrl,
      },
      canArchive
        ? {
            title: t`Archive`,
            icon: "archive",
            action: handleArchive,
          }
        : null,
    ],
    [actionUrl, canEdit, canArchive, handleArchive],
  );

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
        <Menu
          opened={menuOpened}
          onChange={setMenuOpened}
          position="bottom-end"
          closeOnItemClick={false}
        >
          <Menu.Target>
            <div>
              <EntityMenuTrigger
                icon="ellipsis"
                onClick={toggleMenu}
                open={menuOpened}
              />
            </div>
          </Menu.Target>
          <Menu.Dropdown miw={184}>
            {menuItems.map((item, index) => {
              if (!item) {
                return null;
              }

              if (item.link) {
                return (
                  <Menu.Item
                    key={item.title ?? index}
                    component={RouterLink}
                    data-testid="entity-menu-link"
                    leftSection={
                      <Icon name={item.icon} size={16} aria-hidden />
                    }
                    to={item.link}
                    onClick={closeMenu}
                  >
                    {item.title}
                  </Menu.Item>
                );
              }

              return (
                <Menu.Item
                  key={item.title ?? index}
                  leftSection={<Icon name={item.icon} size={16} aria-hidden />}
                  onClick={() => {
                    item.action?.();
                    closeMenu();
                  }}
                >
                  {item.title}
                </Menu.Item>
              );
            })}
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
              <ActionRunButton
                as={Link}
                icon="play"
                onlyIcon
                tooltip={t`Run`}
                aria-label={t`Run`}
                onClick={openExecuteModal}
              />
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
