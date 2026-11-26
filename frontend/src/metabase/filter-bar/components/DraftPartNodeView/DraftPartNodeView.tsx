import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MouseEvent } from "react";
import { match } from "ts-pattern";

import {
  editClickedPart,
  getClickedField,
  getDraftPart,
  placeCaretInField,
} from "../../editor";
import type { FilterParts } from "../../types";
import DraftS from "../DraftNodeView/DraftNodeView.module.css";
import { OperatorPart } from "../OperatorPart/OperatorPart";
import { PillPart } from "../PillPart/PillPart";
import { PillRange } from "../PillRange/PillRange";

type DraftPartNodeViewProps = NodeViewProps & {
  formatValues: (stage: number, parts: FilterParts) => string;
};

export const DraftPartNodeView = ({
  editor,
  node,
  getPos,
  formatValues,
}: DraftPartNodeViewProps) => {
  const part = getDraftPart(node);

  const handleClick = (event: MouseEvent<HTMLElement>) => {
    const pos = getPos();
    const field = getClickedField(event.nativeEvent);
    const isEdited = pos !== undefined && editClickedPart(editor, node, pos);
    if (isEdited && field !== null) {
      placeCaretInField(editor, field);
    }
  };

  if (!part) {
    return null;
  }

  return (
    <NodeViewWrapper as="span" onClick={handleClick}>
      {match(part)
        .with({ type: "column" }, ({ column }) => (
          <PillPart variant="column" part="column">
            {column.label}
          </PillPart>
        ))
        .with({ type: "operator" }, ({ operator }) => (
          <OperatorPart operator={operator} />
        ))
        .with({ type: "values" }, ({ parts, stage }) =>
          match(parts.operator.valueKind)
            .with("range", () => (
              <PillRange
                parts={parts}
                formatValues={(range) => formatValues(stage, range)}
              />
            ))
            .with("multi", () => (
              <PillPart variant="value" part="value" isTruncated={false}>
                {formatValues(stage, parts)}
                <span className={DraftS.comma}>{", "}</span>
              </PillPart>
            ))
            .otherwise(() => (
              <PillPart variant="value" part="value" isTruncated={false}>
                {formatValues(stage, parts)}
              </PillPart>
            )),
        )
        .exhaustive()}
    </NodeViewWrapper>
  );
};
