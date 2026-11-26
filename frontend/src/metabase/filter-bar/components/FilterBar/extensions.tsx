import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { type NodeViewProps, ReactNodeViewRenderer } from "@tiptap/react";

import {
  type DraftActionsOptions,
  createBlankClick,
  createCaret,
  createColumnNode,
  createConnectorNode,
  createDraftActionKeys,
  createDraftActions,
  createDraftInputNode,
  createDraftKeys,
  createDraftLifecycle,
  createDraftNode,
  createDraftPlaceholders,
  createErrorHighlight,
  createFilterBarKeys,
  createHiddenThen,
  createOperatorNode,
  createParenNode,
  createParens,
  createPillNode,
  createRangeAndNode,
  createThenNode,
  createValueNode,
} from "../../editor";
import type { ConnectorToken, ParenToken } from "../../model";
import { ConnectorNodeView } from "../ConnectorNodeView/ConnectorNodeView";
import { DraftNodeView } from "../DraftNodeView/DraftNodeView";
import DraftS from "../DraftNodeView/DraftNodeView.module.css";
import { DraftPartNodeView } from "../DraftPartNodeView/DraftPartNodeView";
import { PillNodeView } from "../PillNodeView/PillNodeView";
import { RangeAndNodeView } from "../RangeAndNodeView/RangeAndNodeView";
import { ThenNodeView } from "../ThenNodeView/ThenNodeView";

import S from "./FilterBar.module.css";
import {
  type DraftSuggestionOptions,
  createDraftSuggestion,
} from "./draft-suggestion";

type ExtensionsOptions<F> = DraftActionsOptions<F> & {
  onSuggestionChange: DraftSuggestionOptions<F>["onChange"];
  onSuggestionKeyDown: DraftSuggestionOptions<F>["onKeyDown"];
};

export const createExtensions = <F,>({
  onSuggestionChange,
  onSuggestionKeyDown,
  ...options
}: ExtensionsOptions<F>) => {
  const { getAdapter } = options;
  const actions = createDraftActions(options);
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
    <PillNodeView {...props} adapter={getAdapter()} />
  );

  const PartView = (props: NodeViewProps) => (
    <DraftPartNodeView
      {...props}
      formatValues={(stage, parts) =>
        getAdapter().stage(stage).formatValues(parts)
      }
    />
  );

  return [
    Document,
    Paragraph,
    Text,
    UndoRedo,
    createPillNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PillView, withDecorations),
    }),
    createConnectorNode("and").extend(connectorView("and")),
    createConnectorNode("or").extend(connectorView("or")),
    createParenNode("open").extend(connectorView("open")),
    createParenNode("close").extend(connectorView("close")),
    createDraftNode().extend({
      addNodeView: () => ReactNodeViewRenderer(DraftNodeView),
    }),
    createDraftInputNode().extend({
      renderHTML: () => ["span", { class: DraftS.input }, 0],
    }),
    createColumnNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PartView),
    }),
    createOperatorNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PartView),
    }),
    createRangeAndNode().extend({
      addNodeView: () => ReactNodeViewRenderer(RangeAndNodeView),
    }),
    createValueNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PartView),
    }),
    createThenNode().extend({
      addNodeView: () => ReactNodeViewRenderer(ThenNodeView),
    }),
    createFilterBarKeys(),
    createParens(),
    createErrorHighlight(),
    createHiddenThen(),
    createBlankClick(),
    createCaret(S.caret),
    createDraftKeys(),
    createDraftLifecycle(),
    createDraftPlaceholders(),
    createDraftActionKeys(actions),
    createDraftSuggestion({
      actions,
      onChange: onSuggestionChange,
      onKeyDown: onSuggestionKeyDown,
    }),
  ];
};
