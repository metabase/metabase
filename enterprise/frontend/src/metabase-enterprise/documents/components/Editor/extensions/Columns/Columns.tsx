import {
  Extension,
  InputRule,
  Node,
  type NodeViewProps,
  mergeAttributes,
} from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";

import { Icon } from "metabase/ui";

import Styles from "./Columns.module.css";

const ColumnBlock = Node.create({
  name: "columnBlock",
  group: "block",
  content: "column{1,}",
  isolating: true,
  selectable: true,

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes);
    return ["div", attrs, 0];
  },

  addInputRules() {
    return [
      new InputRule({
        find: /::columns/g,
        handler: ({ state, range }) => {
          state.tr.delete(range.from, range.to);

          const columnBlockNode = state.schema.nodes.columnBlock.create({}, [
            state.schema.nodes.column.create({}, [
              state.schema.nodes.paragraph.create(),
            ]),
            state.schema.nodes.column.create({}, [
              state.schema.nodes.paragraph.create(),
            ]),
            state.schema.nodes.column.create({}, [
              state.schema.nodes.paragraph.create(),
            ]),
          ]);

          state.tr.insert(range.from, columnBlockNode);
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnBlockView);
  },
});

const ColumnBlockView = () => {
  return (
    <NodeViewWrapper>
      <NodeViewContent className={Styles.ColumnBlock} />
    </NodeViewWrapper>
  );
};

const Column = Node.create({
  name: "column",
  group: "column",
  content: "(block)*",
  isolating: true,
  selectable: true,

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes);
    return ["div", attrs, 0];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ColumnView, {
      className: Styles.Column,
    });
  },
});

const ColumnView = ({ deleteNode }: NodeViewProps) => {
  return (
    <NodeViewWrapper>
      <Icon
        name="close"
        pos="absolute"
        top="6"
        right="6"
        cursor="pointer"
        onClick={deleteNode}
      />

      <NodeViewContent />
    </NodeViewWrapper>
  );
};

export const ColumnExtension = Extension.create({
  name: "columnExtension",

  addExtensions() {
    const extensions = [];

    if (this.options.column !== false) {
      extensions.push(Column);
    }

    if (this.options.columnBlock !== false) {
      extensions.push(ColumnBlock);
    }

    return extensions;
  },
});
