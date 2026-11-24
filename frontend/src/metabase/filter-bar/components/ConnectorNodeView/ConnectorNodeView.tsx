import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { hasErrorDecoration } from "../../editor/error-highlight";
import type { ConnectorToken, ParenToken } from "../../model/types";
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
        .with("open", () => "(")
        .with("close", () => ")")
        .exhaustive()}
      isParen={type === "open" || type === "close"}
      isSelected={selected}
      hasError={hasErrorDecoration(decorations)}
      onRemove={deleteNode}
    />
  </NodeViewWrapper>
);
