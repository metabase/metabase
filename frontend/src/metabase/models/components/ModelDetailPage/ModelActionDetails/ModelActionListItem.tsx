import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { ActionExecuteModal } from "metabase/actions/containers/ActionExecuteModal";
import EntityMenu from "metabase/components/EntityMenu";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Link from "metabase/core/components/Link";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import { Icon } from "metabase/ui";
import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import {
  ActionCardContainer,
  ActionHeader,
  ActionRunButtonContainer,
  ActionRunButton,
  ActionSubtitle,
  ActionSubtitlePart,
  ActionTitle,
  CodeBlock,
  ImplicitActionCardContentRoot,
  MenuIcon,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  actionUrl: string;
  canRun: boolean;
  canEdit: boolean;
  canArchive: boolean;
  onArchive: (action: WritebackAction) => void;
}

interface ModalProps {
  onClose?: () => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  if (!action.dataset_query?.native?.query) {
    return (
      <CodeBlock>
        <Icon name="warning" size={16} tooltip={t`No query found`} />
      </CodeBlock>
    );
  }

  return <CodeBlock>{action.dataset_query.native.query}</CodeBlock>;
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

  const handleArchive = useCallback(() => {
    askConfirmation({
      title: t`Archive ${action.name}?`,
      confirmButtonText: t`Archive`,
      onConfirm: () => onArchive(action),
    });
  }, [action, askConfirmation, onArchive]);

  const menuItems = useMemo(
    () => [
      {
        title: canEdit ? t`Edit` : t`View`,
        icon: canEdit ? "pencil" : "eye",
        link: actionUrl,
      },
      canArchive && {
        title: t`Archive`,
        icon: "archive",
        action: handleArchive,
      },
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
        <EntityMenu items={menuItems} trigger={<MenuIcon name="ellipsis" />} />
      </ActionHeader>
      <ActionCardContainer>
        {action.type === "query" ? (
          <QueryActionCardContent action={action} />
        ) : action.type === "implicit" ? (
          <ImplicitActionCardContent />
        ) : null}
        {canRun && (
          <ModalWithTrigger
            triggerElement={
              <ActionRunButtonContainer>
                <ActionRunButton
                  as={Link}
                  icon="play"
                  onlyIcon
                  tooltip={t`Run`}
                  aria-label={t`Run`}
                />
              </ActionRunButtonContainer>
            }
          >
            {({ onClose }: ModalProps) => (
              <ActionExecuteModal actionId={action.id} onClose={onClose} />
            )}
          </ModalWithTrigger>
        )}
      </ActionCardContainer>
      {confirmationModal}
    </>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ModelActionListItem;
