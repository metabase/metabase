import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { hasErrorDecoration } from "../../editor";
import { PAREN_TEXT } from "../../model";
import type { ConnectorToken, ParenToken } from "../../model";
import { Connector } from "../Connector/Connector";

type ConnectorNodeViewProps = NodeViewProps & {
  type: ConnectorToken["type"] | ParenToken["type"];
};

export const ConnectorNodeView = ({
  type,
  selected,
  decorations,
  deleteNode,
}: ConnectorNodeViewProps) => (
  <NodeViewWrapper as="span">
    <Connector
      label={match(type)
        .with("and", () => t`and`)
        .with("or", () => t`or`)
        .with("open", "close", (paren) => PAREN_TEXT[paren])
        .exhaustive()}
      isParen={type === "open" || type === "close"}
      isSelected={selected}
      hasError={hasErrorDecoration(decorations)}
      onRemove={deleteNode}
    />
  </NodeViewWrapper>
);
