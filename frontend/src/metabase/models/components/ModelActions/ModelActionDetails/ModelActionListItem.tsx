import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import { ForwardRefLink } from "metabase/common/components/Link";
import { ActionIcon, Icon, Menu, Tooltip } from "metabase/ui";
import type { WritebackAction } from "metabase-types/api";

import {
  ActionCardContainer,
  ActionHeader,
  ActionRunButtonContainer,
  ActionSubtitle,
  ActionSubtitlePart,
  ActionTitle,
  ImplicitActionCardContentRoot,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  actionUrl: string;
  canRun: boolean;
  canEdit: boolean;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <div>{t`Auto tracking schema`}</div>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({ action, actionUrl, canRun, canEdit }: Props) {
  const [
    executeModalOpened,
    { open: openExecuteModal, close: closeExecuteModal },
  ] = useDisclosure(false);

  return (
    <>
      <ActionHeader>
        <div>
          <ActionTitle to={actionUrl}>{action.name}</ActionTitle>
          <ActionSubtitle>
            <ActionSubtitlePart>{t`Basic action`}</ActionSubtitlePart>
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
              component={ForwardRefLink}
              data-testid="entity-menu-link"
              leftSection={
                <Icon name={canEdit ? "pencil" : "eye"} aria-hidden />
              }
              to={actionUrl}
            >
              {canEdit ? t`Edit` : t`View`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </ActionHeader>
      <ActionCardContainer>
        <ImplicitActionCardContent />
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
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionListItem;
