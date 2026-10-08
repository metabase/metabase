import { getChunks } from "@codemirror/merge";
import { type EditorState, Prec, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  keymap,
} from "@codemirror/view";
import { useMemo } from "react";
import { useLatest } from "react-use";

import { isMac, isWindows } from "metabase/utils/browser";

const CONTROLS_CLASS_NAME = "cm-diff-controls";
const FALLBACK_CLASS_NAME = "cm-diff-controls-fallback";
const CONTROLS_THEME = EditorView.baseTheme({
  [`.${CONTROLS_CLASS_NAME}`]: {
    position: "sticky",
    bottom: "0",
    zIndex: "1",
    boxSizing: "border-box",
  },
  [`.${FALLBACK_CLASS_NAME}`]: {
    position: "absolute",
    left: "0",
    bottom: "0",
  },
});

function getShortcuts() {
  let keyModifiers = "Ctrl-Alt";
  let hintModifiers = "$mod+Alt";
  if (isWindows()) {
    keyModifiers = "Alt-Shift";
    hintModifiers = "Alt+Shift";
  } else if (isMac()) {
    keyModifiers = "Meta-Alt";
  }
  return {
    accept: { key: `${keyModifiers}-y`, hint: `${hintModifiers}+y` },
    reject: { key: `${keyModifiers}-x`, hint: `${hintModifiers}+x` },
  };
}

class DiffControlsWidget extends WidgetType {
  constructor(private readonly container: HTMLElement) {
    super();
  }

  toDOM() {
    return this.container;
  }

  eq(other: DiffControlsWidget) {
    return this.container === other.container;
  }
}

class DiffControlsViewport {
  constructor(
    private readonly view: EditorView,
    private readonly container: HTMLElement,
    private readonly controlsField: StateField<DecorationSet>,
  ) {
    this.measure();
  }

  update(update: ViewUpdate) {
    if (
      update.docChanged ||
      update.viewportChanged ||
      update.geometryChanged ||
      update.transactions.some((transaction) => transaction.reconfigured)
    ) {
      this.measure();
    }
  }

  measure() {
    const { container, controlsField } = this;
    this.view.requestMeasure({
      key: this,
      read(view) {
        const decorations = view.state.field(controlsField, false);
        if (!decorations) {
          return null;
        }
        return {
          isMounted: view.contentDOM.contains(container),
          isBelowViewport: decorations.iter().from >= view.viewport.to,
          gutterWidth: view.contentDOM.offsetLeft,
          scrollbarWidth:
            view.scrollDOM.offsetWidth - view.scrollDOM.clientWidth,
        };
      },
      write(position, view) {
        if (!position) {
          return;
        }
        if (position.isMounted) {
          container.classList.remove(FALLBACK_CLASS_NAME);
          container.style.paddingLeft = "";
          container.style.right = "";
        } else if (position.isBelowViewport) {
          container.classList.add(FALLBACK_CLASS_NAME);
          container.style.paddingLeft = `${position.gutterWidth}px`;
          container.style.right = `${position.scrollbarWidth}px`;
          if (container.parentElement !== view.dom) {
            view.dom.append(container);
          }
        } else {
          container.remove();
        }
      },
    });
  }

  destroy() {
    this.container.remove();
  }
}

export function createDiffControlsExtensions({
  container,
  shortcuts = getShortcuts(),
  onAcceptProposed,
  onRejectProposed,
}: {
  container: HTMLElement;
  shortcuts?: ReturnType<typeof getShortcuts>;
  onAcceptProposed: () => void;
  onRejectProposed: () => void;
}) {
  container.className = CONTROLS_CLASS_NAME;
  const widget = new DiffControlsWidget(container);

  function decorate(state: EditorState) {
    const chunk = getChunks(state)?.chunks.at(-1);
    const isDeletion = chunk != null && chunk.fromB === chunk.toB;
    const position = isDeletion
      ? chunk.fromB
      : state.doc.lineAt(chunk?.endB ?? state.doc.length).to;

    return Decoration.set([
      Decoration.widget({
        widget,
        block: true,
        side: isDeletion ? 0 : 1,
      }).range(position),
    ]);
  }

  const controlsField = StateField.define<DecorationSet>({
    create: decorate,
    update(decorations, transaction) {
      const before = getChunks(transaction.startState)?.chunks;
      const after = getChunks(transaction.state)?.chunks;
      return transaction.docChanged || before !== after
        ? decorate(transaction.state)
        : decorations;
    },
    provide: (field) => EditorView.decorations.from(field),
  });

  return [
    CONTROLS_THEME,
    controlsField,
    EditorView.scrollMargins.of(() => ({ bottom: container.offsetHeight })),
    ViewPlugin.define(
      (view) => new DiffControlsViewport(view, container, controlsField),
    ),
    Prec.highest(
      keymap.of([
        {
          key: shortcuts.accept.key,
          run: () => {
            onAcceptProposed();
            return true;
          },
        },
        {
          key: shortcuts.reject.key,
          run: () => {
            onRejectProposed();
            return true;
          },
        },
      ]),
    ),
  ];
}

export function useDiffControls({
  onAcceptProposed,
  onRejectProposed,
}: {
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
}) {
  const portalTarget = useMemo(() => document.createElement("div"), []);
  const shortcuts = useMemo(getShortcuts, []);
  const onAcceptRef = useLatest(onAcceptProposed);
  const onRejectRef = useLatest(onRejectProposed);
  const isEnabled = !!onAcceptProposed && !!onRejectProposed;
  const extensions = useMemo(
    () =>
      isEnabled
        ? createDiffControlsExtensions({
            container: portalTarget,
            shortcuts,
            onAcceptProposed: () => onAcceptRef.current?.(),
            onRejectProposed: () => onRejectRef.current?.(),
          })
        : [],
    [isEnabled, portalTarget, shortcuts, onAcceptRef, onRejectRef],
  );

  return { extensions, portalTarget, shortcuts };
}
