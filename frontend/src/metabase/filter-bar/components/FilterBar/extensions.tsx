import { type NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { createCaret } from "../../editor/caret";
import { createErrorHighlight } from "../../editor/error-highlight";
import { createHiddenThen } from "../../editor/hidden-then";
import {
  createConnectorNode,
  createParenNode,
  createPillNode,
  createThenNode,
} from "../../editor/nodes";
import type { PillRegistry } from "../../editor/pill-registry";
import { createFilterBarRules } from "../../editor/rules";
import type { ConnectorToken, ParenToken } from "../../model/types";
import type { FilterBarAdapter } from "../../types";
import { ConnectorNodeView } from "../ConnectorNodeView/ConnectorNodeView";
import { PillNodeView } from "../PillNodeView/PillNodeView";
import { ThenNodeView } from "../ThenNodeView/ThenNodeView";

import S from "./FilterBar.module.css";

export const createExtensions = <F,>(
  adapter: FilterBarAdapter<F>,
  registry: PillRegistry<F>,
) => {
  const withDecorations = {
    update: ({ updateProps }: { updateProps: () => void }) => {
      updateProps();
      return true;
    },
  };

  const connectorView = (type: ConnectorToken["type"] | ParenToken["type"]) => {
    const ConnectorView = (props: NodeViewProps) => (
      <ConnectorNodeView {...props} type={type} />
    );
    return {
      addNodeView: () => ReactNodeViewRenderer(ConnectorView, withDecorations),
    };
  };

  const PillView = (props: NodeViewProps) => (
    <PillNodeView {...props} adapter={adapter} registry={registry} />
  );

  return [
    StarterKit.configure({
      blockquote: false,
      bold: false,
      bulletList: false,
      code: false,
      codeBlock: false,
      dropcursor: false,
      gapcursor: false,
      hardBreak: false,
      heading: false,
      horizontalRule: false,
      italic: false,
      link: false,
      listItem: false,
      listKeymap: false,
      orderedList: false,
      strike: false,
      trailingNode: false,
      underline: false,
    }),
    createPillNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PillView, withDecorations),
    }),
    createConnectorNode("and").extend(connectorView("and")),
    createConnectorNode("or").extend(connectorView("or")),
    createParenNode("open").extend(connectorView("open")),
    createParenNode("close").extend(connectorView("close")),
    createThenNode().extend({
      addNodeView: () => ReactNodeViewRenderer(ThenNodeView),
    }),
    createFilterBarRules(),
    createErrorHighlight(),
    createHiddenThen(),
    createCaret(S.caret),
  ];
};
