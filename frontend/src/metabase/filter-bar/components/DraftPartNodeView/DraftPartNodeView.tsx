import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import type { MouseEvent } from "react";
import { match } from "ts-pattern";

import {
  editClickedPart,
  getClickedField,
  getDraftPart,
  placeCaretInField,
} from "../../editor";
import DraftS from "../DraftNodeView/DraftNodeView.module.css";
import { useFilterBarContext } from "../FilterBar/FilterBarContext";
import { OperatorPart } from "../OperatorPart/OperatorPart";
import { PillPart } from "../PillPart/PillPart";
import { PillRange } from "../PillRange/PillRange";

export const DraftPartNodeView = ({ editor, node, getPos }: NodeViewProps) => {
  const { formatValues } = useFilterBarContext();
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
        .with({ type: "values" }, ({ parts, targetStage }) =>
          match(parts.operator.valueKind)
            .with("range", () => (
              <PillRange
                parts={parts}
                formatValues={(range) => formatValues(targetStage, range)}
              />
            ))
            .with("multi", () => (
              <PillPart variant="value" part="value" isTruncated={false}>
                {formatValues(targetStage, parts)}
                <span className={DraftS.comma}>{", "}</span>
              </PillPart>
            ))
            .otherwise(() => (
              <PillPart variant="value" part="value" isTruncated={false}>
                {formatValues(targetStage, parts)}
              </PillPart>
            )),
        )
        .exhaustive()}
    </NodeViewWrapper>
  );
};
