import React from "react";
import { t } from "ttag";

import ImplicitActionIcon from "metabase/actions/components/ImplicitActionIcon";

import type { WritebackAction, WritebackQueryAction } from "metabase-types/api";

import { isNotNull } from "metabase/core/utils/types";
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
      <ImplicitActionIcon size={32} />
      <ImplicitActionMessage>{t`Auto tracking schema`}</ImplicitActionMessage>
    </ImplicitActionCardContentRoot>
  );
}

function ModelActionListItem({ action, editorUrl, canWrite }: Props) {
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
        <EditorLink icon={canWrite ? "pencil" : "eye"} to={editorUrl} />
      </Card>
    </>
  );
}

export default ModelActionListItem;
