import React from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ActionRunModal from "metabase/actions/containers/ActionExecuteModal";
import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";
import StackedInsightIcon from "./StackedInsightIcon";
import {
  ActionCard,
  ActionCodeBlock,
  ActionRoot,
  ActionRunButton,
  ActionSubtitle,
  ActionSubtitlePart,
  ActionTitle,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
} from "./ModelActionListItem.styled";

interface ItemProps {
  action: WritebackAction;
  actionUrl: string;
}

interface ModalProps {
  onClose?: () => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  return <ActionCodeBlock>{action.dataset_query.native.query}</ActionCodeBlock>;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <StackedInsightIcon />
      <ImplicitActionMessage>{t`Auto tracking schema`}</ImplicitActionMessage>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({ action, actionUrl }: ItemProps) {
  const isQueryAction = action.type === "query";

  return (
    <ActionRoot to={isQueryAction ? actionUrl : ""}>
      <ActionTitle>{action.name}</ActionTitle>
      <ActionSubtitle>
        {action.public_uuid && (
          <ActionSubtitlePart>{t`Public Action`}</ActionSubtitlePart>
        )}
        {action.creator && (
          <ActionSubtitlePart>
            {t`Created by ${action.creator.common_name}`}
          </ActionSubtitlePart>
        )}
      </ActionSubtitle>
      <ActionCard>
        {action.type === "query" ? (
          <QueryActionCardContent action={action} />
        ) : action.type === "implicit" ? (
          <ImplicitActionCardContent />
        ) : null}
        <ModalWithTrigger
          triggerElement={<ActionRunButton as={Link} icon="play" onlyIcon />}
        >
          {({ onClose }: ModalProps) => (
            <ActionRunModal actionId={action.id} onClose={onClose} />
          )}
        </ModalWithTrigger>
      </ActionCard>
    </ActionRoot>
  );
}

export default ModelActionListItem;
