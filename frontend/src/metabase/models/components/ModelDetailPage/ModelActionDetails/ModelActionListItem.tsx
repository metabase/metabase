import React, { useCallback } from "react";

import type { WritebackAction } from "metabase-types/api";

import {
  ActionTitle,
  CodeBlock,
  CodeContainer,
  EditButton,
} from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
  onEdit?: () => void;
}

function ModelActionListItem({ action, onEdit }: Props) {
  if (action.type !== "query") {
    console.warn(
      `ModelActionListItem doesn't support "${action.type} actions"`,
    );
    return null;
  }

  return (
    <div>
      <ActionTitle>{action.name}</ActionTitle>
      <CodeContainer>
        <CodeBlock>{action.dataset_query.native.query}</CodeBlock>
        {onEdit && <EditButton onClick={onEdit} />}
      </CodeContainer>
    </div>
  );
}

export default ModelActionListItem;
