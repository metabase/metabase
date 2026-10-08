import { unifiedMergeView } from "@codemirror/merge";
import { EditorView } from "@codemirror/view";

import { createDiffControlsExtensions } from "./use-diff-controls";

const ORIGINAL = "SELECT *\nFROM orders\nWHERE id = 1\nORDER BY id;\n-- end";
const PROPOSED = "SELECT *\nFROM orders\nWHERE id = 2\nORDER BY id;\n-- end";
let cleanup: (() => void) | undefined;

function setup({ original = ORIGINAL, proposed = PROPOSED } = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const controls = document.createElement("div");
  const mergeExtension = unifiedMergeView({ original, mergeControls: false });
  const view = new EditorView({
    parent: container,
    doc: proposed,
    extensions: [
      mergeExtension,
      ...createDiffControlsExtensions({
        container: controls,
        onAcceptProposed: jest.fn(),
        onRejectProposed: jest.fn(),
      }),
    ],
  });

  cleanup = () => {
    view.destroy();
    container.remove();
  };

  return { view, getControls: () => controls };
}

describe("diff controls widget", () => {
  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  it("gives the controls their own row between the change and following code", () => {
    const { view, getControls } = setup();
    const controls = getControls();

    expect(controls.parentElement).toBe(view.contentDOM);
    expect(controls.previousElementSibling).toHaveTextContent("WHERE id = 2");
    expect(controls.nextElementSibling).toHaveTextContent("ORDER BY id;");
    expect(controls.previousElementSibling).toHaveClass("cm-line");
    expect(controls.nextElementSibling).toHaveClass("cm-line");
  });

  it("reserves the current review row height when scrolling the cursor into view", () => {
    const { view, getControls } = setup();
    const height = jest
      .spyOn(getControls(), "offsetHeight", "get")
      .mockReturnValue(40);
    const margins = () =>
      view.state.facet(EditorView.scrollMargins).map((margin) => margin(view));

    expect(margins()).toContainEqual({ bottom: 40 });

    height.mockReturnValue(64);

    expect(margins()).toContainEqual({ bottom: 64 });
  });

  it("places controls after the last of several changes", () => {
    const { getControls } = setup({
      proposed: PROPOSED.replace("-- end", "-- changed"),
    });

    expect(getControls().previousElementSibling).toHaveTextContent(
      "-- changed",
    );
    expect(getControls().nextElementSibling).toBeNull();
  });

  it("places controls after deleted lines and before following code", () => {
    const { getControls } = setup({
      proposed: ORIGINAL.replace("WHERE id = 1\n", ""),
    });
    const controls = getControls();

    expect(controls.previousElementSibling).toHaveClass("cm-deletedChunk");
    expect(controls.previousElementSibling).toHaveTextContent("WHERE id = 1");
    expect(controls.nextElementSibling).toHaveTextContent("ORDER BY id;");
  });

  it.each([
    ["an identical proposal", ORIGINAL, ORIGINAL],
    ["a proposal replacing the whole query", "SELECT 1", PROPOSED],
    ["an empty original query", "", PROPOSED],
  ])("places controls after %s", (_name, original, proposed) => {
    const { getControls } = setup({ original, proposed });

    expect(getControls().previousElementSibling).toHaveTextContent("-- end");
    expect(getControls().nextElementSibling).toBeNull();
  });
});

async function withWindowsEditor(
  test: (
    view: EditorView,
    callbacks: {
      onAcceptProposed: jest.Mock<void, []>;
      onRejectProposed: jest.Mock<void, []>;
    },
  ) => void,
) {
  const platform = navigator.platform;
  Object.defineProperty(navigator, "platform", {
    value: "Win32",
    configurable: true,
  });
  try {
    await jest.isolateModulesAsync(async () => {
      const { EditorView } = await import("@codemirror/view");
      const { createDiffControlsExtensions } =
        await import("./use-diff-controls");
      const callbacks = {
        onAcceptProposed: jest.fn<void, []>(),
        onRejectProposed: jest.fn<void, []>(),
      };
      const view = new EditorView({
        parent: document.body,
        doc: "SELECT 2",
        extensions: createDiffControlsExtensions({
          container: document.createElement("div"),
          ...callbacks,
        }),
      });
      try {
        test(view, callbacks);
      } finally {
        view.destroy();
      }
    });
  } finally {
    Object.defineProperty(navigator, "platform", { value: platform });
  }
}

describe("Windows review shortcuts", () => {
  it.each([
    ["y", "onAcceptProposed", "onRejectProposed"],
    ["x", "onRejectProposed", "onAcceptProposed"],
  ] as const)(
    "resolves the proposal with Alt+Shift+%s",
    async (key, action, otherAction) => {
      await withWindowsEditor((view, callbacks) => {
        const event = new KeyboardEvent("keydown", {
          key: key.toUpperCase(),
          code: `Key${key.toUpperCase()}`,
          keyCode: key.toUpperCase().charCodeAt(0),
          altKey: true,
          shiftKey: true,
          bubbles: true,
          cancelable: true,
        });

        view.contentDOM.dispatchEvent(event);

        expect(callbacks[action]).toHaveBeenCalledTimes(1);
        expect(callbacks[otherAction]).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(true);
      });
    },
  );

  it.each([
    ["ü", "KeyY", 89],
    ["ź", "KeyX", 88],
  ] as const)(
    "leaves AltGr+%s available for typing",
    async (key, code, keyCode) => {
      await withWindowsEditor((view, callbacks) => {
        const event = new KeyboardEvent("keydown", {
          key,
          code,
          keyCode,
          altKey: true,
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        });

        view.contentDOM.dispatchEvent(event);

        expect(callbacks.onAcceptProposed).not.toHaveBeenCalled();
        expect(callbacks.onRejectProposed).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
      });
    },
  );
});
