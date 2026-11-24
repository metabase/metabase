import { Extension } from "@tiptap/core";
import { Plugin, TextSelection } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const createCaret = (className: string) =>
  Extension.create({
    name: "caret",
    addProseMirrorPlugins: () => [
      new Plugin({
        props: {
          decorations: ({ doc, selection }) => {
            if (!(selection instanceof TextSelection)) {
              return DecorationSet.empty;
            }
            const createElement = () => {
              const element = document.createElement("span");
              element.className = className;
              return element;
            };
            return DecorationSet.create(doc, [
              Decoration.widget(selection.head, createElement, {
                key: `caret-${selection.head}`,
              }),
            ]);
          },
        },
      }),
    ],
  });
