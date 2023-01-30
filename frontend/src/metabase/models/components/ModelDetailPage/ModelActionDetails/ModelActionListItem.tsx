import React from "react";
import { t } from "ttag";

import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import StackedInsightIcon from "./StackedInsightIcon";
import {
  ActionTitle,
  ActionSubtitle,
  Card,
  CodeBlock,
  EditButton,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
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

  return (
    <>
      <ActionTitle>{action.name}</ActionTitle>
      {action?.creator?.common_name && (
        <ActionSubtitle>{t`Created by ${action.creator.common_name}`}</ActionSubtitle>
      )}
      <Card>
        {renderCardContent()}
        {canEdit && <EditButton onClick={onEdit} />}
      </Card>
    </>
  );
}

export default ModelActionListItem;
