import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { match } from "ts-pattern";
import { t } from "ttag";

import { Flex, Icon } from "metabase/ui";

import { hasErrorDecoration } from "../../editor";
import { PAREN_TEXT } from "../../model";
import type { ConnectorToken } from "../../model";

import S from "./ConnectorNodeView.module.css";

type ConnectorNodeViewProps = NodeViewProps & {
  type: ConnectorToken["type"];
};

export const ConnectorNodeView = ({
  type,
  selected,
  decorations,
  deleteNode,
}: ConnectorNodeViewProps) => (
  <NodeViewWrapper as="span">
    <Flex
      className={S.connector}
      component="span"
      pos="relative"
      align="center"
      justify="center"
      py="xxs"
      px={type in PAREN_TEXT ? "xxs" : "xs"}
      bdrs="md"
      c="text-primary"
      ff="monospace"
      fz="sm"
      fw={500}
      lh={1.15}
      tt="uppercase"
      data-selected={selected || undefined}
      data-error={hasErrorDecoration(decorations) || undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={deleteNode}
    >
      <span className={S.label}>
        {match(type)
          .with("and", () => t`and`)
          .with("or", () => t`or`)
          .with("open", "close", (paren) => PAREN_TEXT[paren])
          .exhaustive()}
      </span>
      <span className={S.removeIcon}>
        <Icon name="close" size={12} />
      </span>
    </Flex>
  </NodeViewWrapper>
);
