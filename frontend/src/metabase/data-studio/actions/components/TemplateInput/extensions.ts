import { EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  MatchDecorator,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";

import { TEMPLATE_VARIABLE_REGEX } from "../../utils";

import S from "./TemplateInput.module.css";

const variableDecorator = new MatchDecorator({
  regexp: TEMPLATE_VARIABLE_REGEX,
  decoration: Decoration.mark({ class: S.variable }),
});

export function templateVariables(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = variableDecorator.createDeco(view);
      }

      update(update: ViewUpdate) {
        this.decorations = variableDecorator.updateDeco(
          update,
          this.decorations,
        );
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

export function singleLine(): Extension {
  return EditorState.transactionFilter.of((transaction) =>
    transaction.newDoc.lines > 1 ? [] : transaction,
  );
}
