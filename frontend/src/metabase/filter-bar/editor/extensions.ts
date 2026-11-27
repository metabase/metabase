import type { AnyExtension, Node, NodeViewRenderer } from "@tiptap/core";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";

import { createDraftKeys } from "./draft/plugins/keys";
import { createDraftLifecycle } from "./draft/plugins/lifecycle";
import { createDraftPlaceholders } from "./draft/plugins/placeholders";
import {
  createColumnNode,
  createConnectorNode,
  createDocumentNode,
  createDraftInputNode,
  createDraftNode,
  createOperatorNode,
  createPillNode,
  createRangeAndNode,
  createThenNode,
  createValueNode,
} from "./nodes/nodes";
import { createBlankClick } from "./plugins/blank-click";
import { createCaret } from "./plugins/caret";
import { createErrorHighlight } from "./plugins/error-highlight";
import { createHiddenThen } from "./plugins/hidden-then";
import { createFilterBarKeys } from "./plugins/keys";
import { createParens } from "./plugins/parens";

type NodeViews = Partial<
  Record<
    | "pill"
    | "connector"
    | "then"
    | "draft"
    | "column"
    | "operator"
    | "value"
    | "rangeAnd",
    NodeViewRenderer
  >
>;

type EditorExtensionsOptions = {
  caretClassName: string;
  inputClassName?: string;
  nodeViews?: NodeViews;
};

const withView = (node: Node, view: NodeViewRenderer | undefined) =>
  view ? node.extend({ addNodeView: () => view }) : node;

export const createEditorExtensions = ({
  caretClassName,
  inputClassName,
  nodeViews = {},
}: EditorExtensionsOptions): AnyExtension[] => [
  createDocumentNode(),
  Text,
  UndoRedo,
  withView(createPillNode(), nodeViews.pill),
  withView(createConnectorNode(), nodeViews.connector),
  withView(createThenNode(), nodeViews.then),
  withView(createDraftNode(), nodeViews.draft),
  createDraftInputNode().extend({
    renderHTML: () => ["span", { class: inputClassName }, 0],
  }),
  withView(createColumnNode(), nodeViews.column),
  withView(createOperatorNode(), nodeViews.operator),
  withView(createValueNode(), nodeViews.value),
  withView(createRangeAndNode(), nodeViews.rangeAnd),
  createFilterBarKeys(),
  createParens(),
  createErrorHighlight(),
  createHiddenThen(),
  createBlankClick(),
  createCaret(caretClassName),
  createDraftKeys(),
  createDraftLifecycle(),
  createDraftPlaceholders(),
];
