import React, { useCallback, useMemo } from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import EntityMenu from "metabase/components/EntityMenu";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import { useConfirmation } from "metabase/hooks/use-confirmation";
import ImplicitActionIcon from "metabase/actions/components/ImplicitActionIcon";
import ActionExecuteModal from "metabase/actions/containers/ActionExecuteModal";
import { WritebackAction, WritebackQueryAction } from "metabase-types/api";
import {
  ActionCard,
  ActionHeader,
  ActionRunButtonContainer,
  ActionRunButton,
  ActionSubtitle,
  ActionSubtitlePart,
  ActionTitle,
  CodeBlock,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
  MenuIcon,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  actionUrl: string;
  canWrite: boolean;
  canRun: boolean;
  onArchive: (action: WritebackAction) => void;
}

interface ModalProps {
  onClose?: () => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  return <CodeBlock>{action.dataset_query.native.query}</CodeBlock>;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <ImplicitActionIcon size={32} />
      <ImplicitActionMessage>{t`Auto tracking schema`}</ImplicitActionMessage>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({
  action,
  actionUrl,
  canWrite,
  canRun,
  onArchive,
}: Props) {
  const canArchive = canWrite && action.type !== "implicit";
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
        title: canWrite ? t`Edit` : t`View`,
        icon: canWrite ? "pencil" : "eye",
        link: actionUrl,
      },
      canArchive && {
        title: t`Archive`,
        icon: "archive",
        action: handleArchive,
      },
    ],
    [actionUrl, canWrite, canArchive, handleArchive],
  );

  return (
    <>
      <ActionHeader>
        <div>
          <ActionTitle to={actionUrl}>{action.name}</ActionTitle>
          <ActionSubtitle>
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
        <EntityMenu
          items={menuItems}
          trigger={<MenuIcon name="ellipsis" size={14} />}
        />
      </ActionHeader>
      <ActionCard>
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
                  tooltip={t`Run action`}
                />
              </ActionRunButtonContainer>
            }
          >
            {({ onClose }: ModalProps) => (
              <ActionExecuteModal actionId={action.id} onClose={onClose} />
            )}
          </ModalWithTrigger>
        )}
      </ActionCard>
      {confirmationModal}
    </>
  );
}

export default ModelActionListItem;
