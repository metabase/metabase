import React, { useCallback, MouseEvent } from "react";
import { t } from "ttag";
import Link from "metabase/core/components/Link";
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

interface Props {
  action: WritebackAction;
  actionUrl: string;
  runActionUrl: string;
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

function ModelActionListItem({ action, actionUrl, runActionUrl }: Props) {
  const isQueryAction = action.type === "query";

  const handleRunClick = useCallback((event: MouseEvent) => {
    event.stopPropagation();
  }, []);

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
        <ActionRunButton
          as={Link}
          to={runActionUrl}
          icon="play"
          onlyIcon
          onClick={handleRunClick}
        />
      </ActionCard>
    </ActionRoot>
  );
}

export default ModelActionListItem;
