import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import type { SyntaxNodeRef } from "@lezer/common";

const TOKEN_CLASS_NAME = "cm-clickable-token";
const TOKEN_CLASS = `.${TOKEN_CLASS_NAME}`;
const DATA_TOKEN_ATTRIBUTE = "data-token-key";

const computeTokenDecorations = (
  view: EditorView,
  tokenDefsMap: Map<string, TokenDef>,
): DecorationSet => {
  const builder = new RangeSetBuilder<Decoration>();
  const tree = syntaxTree(view.state);

  for (const { from, to } of view.visibleRanges) {
    tree.iterate({
      from,
      to,
      enter(node) {
        for (const [key, tokenDef] of tokenDefsMap.entries()) {
          if (!tokenDef.tokenLocator(view, node)) {
            continue;
          }
          builder.add(
            node.from,
            node.to,
            Decoration.mark({
              attributes: {
                class: TOKEN_CLASS_NAME,
                [DATA_TOKEN_ATTRIBUTE]: key,
              },
            }),
          );
        }
      },
    });
  }

  return builder.finish();
};

export const clickableTokens = (tokenDefs: TokenDef[]) => {
  const tokenDefsMap = new Map<string, TokenDef>();
  tokenDefs.forEach((tokenDef, index) =>
    tokenDefsMap.set(`${index}`, tokenDef),
  );

  const plugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = computeTokenDecorations(view, tokenDefsMap);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged) {
          this.decorations = computeTokenDecorations(update.view, tokenDefsMap);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
      eventHandlers: {
        click(e) {
          if (!(e.target instanceof Element)) {
            return false;
          }
          const el = e.target.closest(TOKEN_CLASS);
          if (!el) {
            return false;
          }
          const key = el.getAttribute(DATA_TOKEN_ATTRIBUTE);
          if (key) {
            const tokenDef = tokenDefsMap.get(key);
            if (tokenDef?.onClick) {
              tokenDef.onClick(e);
              return true;
            }
          }
          return false;
        },
      },
    },
  );

  const theme = EditorView.baseTheme({
    [TOKEN_CLASS]: { cursor: "pointer", textDecoration: "underline" },
  });

  return [plugin, theme];
};

type TokenDef = {
  tokenLocator: (view: EditorView, node: SyntaxNodeRef) => boolean;
  onClick: (e: MouseEvent) => void;
};
