import React from "react";
import { t } from "ttag";

import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import { isNotNull } from "metabase/core/utils/types";
import StackedInsightIcon from "./StackedInsightIcon";
import {
  ActionTitle,
  ActionSubtitle,
  Card,
  CodeBlock,
  EditButton,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
  ActionSubtitlePart,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  onEdit?: () => void;
}

function QueryActionCardContent({ action }: { action: WritebackQueryAction }) {
  return <CodeBlock>{action.dataset_query.native.query}</CodeBlock>;
}

function ImplicitActionCardContent() {
  return (
    <ImplicitActionCardContentRoot>
      <StackedInsightIcon />
      <ImplicitActionMessage>{t`Auto tracking schema`}</ImplicitActionMessage>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({ action, onEdit }: Props) {
  const canEdit = action.type !== "implicit" && onEdit;

  const renderCardContent = () =>
    action.type === "query" ? (
      <QueryActionCardContent action={action} />
    ) : action.type === "implicit" ? (
      <ImplicitActionCardContent />
    ) : null;

  const subtitleParts = [
    action.public_uuid && t`Public Action`,
    // Remove this optional chaining after removed all the existing actions without creators
    action.creator?.common_name && t`Created by ${action.creator.common_name}`,
  ].filter(isNotNull);

  return (
    <>
      <ActionTitle>{action.name}</ActionTitle>
      {subtitleParts.length > 0 && (
        <ActionSubtitle>
          {subtitleParts.map((subtitlePart, index) => (
            <ActionSubtitlePart key={index}>{subtitlePart}</ActionSubtitlePart>
          ))}
        </ActionSubtitle>
      )}
      <Card>
        {renderCardContent()}
        {canEdit && <EditButton onClick={onEdit} />}
      </Card>
    </>
  );
}

export default ModelActionListItem;
