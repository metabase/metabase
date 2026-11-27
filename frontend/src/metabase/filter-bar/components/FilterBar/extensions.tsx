import { ReactNodeViewRenderer } from "@tiptap/react";

import {
  type DraftActionsOptions,
  type DraftSuggestionOptions,
  createDraftActionKeys,
  createDraftActions,
  createDraftSuggestion,
  createEditorExtensions,
} from "../../editor";
import { ConnectorNodeView } from "../ConnectorNodeView/ConnectorNodeView";
import { PartNodeView } from "../PartNodeView/PartNodeView";
import { PillNodeView } from "../PillNodeView/PillNodeView";
import PillS from "../PillNodeView/PillNodeView.module.css";
import { RangeAndNodeView } from "../RangeAndNodeView/RangeAndNodeView";
import { ThenNodeView } from "../ThenNodeView/ThenNodeView";

import S from "./FilterBar.module.css";

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
    ...createEditorExtensions({
      caretClassName: S.caret,
      inputClassName: PillS.input,
      nodeViews: {
        pill: ReactNodeViewRenderer(PillNodeView, withDecorations),
        connector: ReactNodeViewRenderer(ConnectorNodeView, withDecorations),
        then: ReactNodeViewRenderer(ThenNodeView),
        draft: ReactNodeViewRenderer(PillNodeView),
        column: ReactNodeViewRenderer(PartNodeView),
        operator: ReactNodeViewRenderer(PartNodeView),
        value: ReactNodeViewRenderer(PartNodeView),
        rangeAnd: ReactNodeViewRenderer(RangeAndNodeView),
      },
    }),
    createDraftActionKeys(actions),
    createDraftSuggestion({
      actions,
      onChange: onSuggestionChange,
      onKeyDown: onSuggestionKeyDown,
    }),
  ];
};
