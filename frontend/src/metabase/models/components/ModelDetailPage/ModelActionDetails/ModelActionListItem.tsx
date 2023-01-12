import React from "react";

import type { WritebackAction } from "metabase-types/api";

import { ActionTitle, CodeBlock } from "./ModelActionListItem.styled";

interface Props {
  action: WritebackAction;
}

function ModelActionListItem({ action }: Props) {
  if (action.type !== "query") {
    console.warn(
      `ModelActionListItem doesn't support "${action.type} actions"`,
    );
    return null;
  }

  return (
    <div>
      <ActionTitle>{action.name}</ActionTitle>
      <CodeBlock>{action.dataset_query.native.query}</CodeBlock>
    </div>
  );
}

export default ModelActionListItem;
