import {
  NodeViewContent,
  type NodeViewProps,
  NodeViewWrapper,
} from "@tiptap/react";
import { P, match } from "ts-pattern";

import { FixedSizeIcon, Flex } from "metabase/ui";

import {
  getNodeViewStage,
  getPillToken,
  hasErrorDecoration,
  isDraftNode,
} from "../../editor";
import {
  isExpressionPillContent,
  isOpaquePillContent,
  isPartsPillContent,
} from "../../types";
import { PartView } from "../PartView/PartView";
import { PillFrame } from "../PillFrame/PillFrame";
import { PillPart } from "../PillPart/PillPart";

import S from "./PillNodeView.module.css";

export const PillNodeView = (props: NodeViewProps) => {
  const { node, selected, decorations, deleteNode } = props;

  if (isDraftNode(node)) {
    return (
      <NodeViewWrapper as="span">
        <PillFrame isEditing onRemove={deleteNode}>
          <NodeViewContent<"span"> as="span" className={S.parts} />
        </PillFrame>
      </NodeViewWrapper>
    );
  }

  const token = getPillToken(node);
  if (!token) {
    return null;
  }

  const { content } = token;
  const isOpaque = isOpaquePillContent(content);

  return (
    <NodeViewWrapper as="span">
      <PillFrame
        isSelected={selected}
        hasError={hasErrorDecoration(decorations)}
        pl={isOpaque ? "sm" : "xxs"}
        onRemove={deleteNode}
      >
        <Flex
          className={S.parts}
          component="span"
          align="center"
          gap={isOpaque ? "xxxs" : 0}
        >
          {match(content)
            .with(P.when(isOpaquePillContent), ({ displayName, icon }) => (
              <>
                <FixedSizeIcon name={icon} size={10} c="core-filter-strong" />
                <PillPart variant="value">{displayName}</PillPart>
              </>
            ))
            .with(P.when(isExpressionPillContent), ({ expression }) => (
              <PillPart variant="expression">{expression}</PillPart>
            ))
            .with(P.when(isPartsPillContent), ({ parts }) => {
              const targetStage = getNodeViewStage(props);
              return (
                <>
                  <PartView
                    part={{ type: "column", column: parts.column, targetStage }}
                  />
                  <PartView
                    part={{ type: "operator", operator: parts.operator }}
                  />
                  <PartView part={{ type: "values", parts, targetStage }} />
                </>
              );
            })
            .exhaustive()}
        </Flex>
      </PillFrame>
    </NodeViewWrapper>
  );
};
