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
  EditorLink,
  ImplicitActionCardContentRoot,
  ImplicitActionMessage,
  ActionSubtitlePart,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  editorUrl: string;
  canWrite: boolean;
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

function ModelActionListItem({ action, editorUrl, canWrite }: Props) {
  const hasEditorLink = action.type !== "implicit";

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
        {hasEditorLink && (
          <EditorLink icon={canWrite ? "pencil" : "eye"} to={editorUrl} />
        )}
      </Card>
    </>
  );
}

export default ModelActionListItem;
