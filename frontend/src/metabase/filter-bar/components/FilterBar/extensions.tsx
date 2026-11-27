import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import { UndoRedo } from "@tiptap/extensions";
import { ReactNodeViewRenderer } from "@tiptap/react";

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
  createParens,
  createPillNode,
  createRangeAndNode,
  createThenNode,
  createValueNode,
} from "../../editor";
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
  const actions = createDraftActions(options);
  const withDecorations = {
    update: ({ updateProps }: { updateProps: () => void }) => {
      updateProps();
      return true;
    },
  };

  return [
    Document,
    Paragraph,
    Text,
    UndoRedo,
    createPillNode().extend({
      addNodeView: () => ReactNodeViewRenderer(PillNodeView, withDecorations),
    }),
    createConnectorNode().extend({
      addNodeView: () =>
        ReactNodeViewRenderer(ConnectorNodeView, withDecorations),
    }),
    createDraftNode().extend({
      addNodeView: () => ReactNodeViewRenderer(DraftNodeView),
    }),
    createDraftInputNode().extend({
      renderHTML: () => ["span", { class: DraftS.input }, 0],
    }),
    createColumnNode().extend({
      addNodeView: () => ReactNodeViewRenderer(DraftPartNodeView),
    }),
    createOperatorNode().extend({
      addNodeView: () => ReactNodeViewRenderer(DraftPartNodeView),
    }),
    createRangeAndNode().extend({
      addNodeView: () => ReactNodeViewRenderer(RangeAndNodeView),
    }),
    createValueNode().extend({
      addNodeView: () => ReactNodeViewRenderer(DraftPartNodeView),
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
