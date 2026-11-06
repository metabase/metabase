import { act, renderHook } from "@testing-library/react";

import { CLOSE_PAREN, OPEN_PAREN, type Token, opToken } from "./tokens";
import {
  MAX_HISTORY,
  getHistoryAction,
  useExpressionHistory,
} from "./use-expression-history";

const AND = opToken("and");
const OR = opToken("or");

type SetupOpts = {
  tokens?: Token[];
  caretIndex?: number;
};

function setup({ tokens = [], caretIndex = tokens.length }: SetupOpts = {}) {
  const onRestore = jest.fn<void, [{ tokens: Token[]; caret: number }]>();
  const barRef = { current: null };
  const { result, rerender } = renderHook(
    (props: Required<SetupOpts>) =>
      useExpressionHistory({ ...props, barRef, onRestore }),
    { initialProps: { tokens, caretIndex } },
  );
  // A user edit: the bar records before it changes its state, then re-renders.
  const edit = (next: Token[], caret = next.length, group?: string) => {
    act(() => result.current.record(group != null ? { group } : undefined));
    rerender({ tokens: next, caretIndex: caret });
  };
  return { result, rerender, onRestore, edit };
}

describe("useExpressionHistory", () => {
  it("restores the snapshot taken before the last edit", () => {
    const { result, onRestore, edit } = setup({ tokens: [AND], caretIndex: 0 });
    edit([AND, OR], 2);

    act(() => result.current.undo());

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith({ tokens: [AND], caret: 0 });
  });

  it("steps back through several edits in order", () => {
    const { result, onRestore, edit } = setup();
    edit([AND]);
    edit([AND, OR]);
    edit([AND, OR, OPEN_PAREN]);

    act(() => result.current.undo());
    act(() => result.current.undo());

    expect(onRestore.mock.calls).toEqual([
      [{ tokens: [AND, OR], caret: 2 }],
      [{ tokens: [AND], caret: 1 }],
    ]);
  });

  it("does nothing with an empty history", () => {
    const { result, onRestore } = setup({ tokens: [AND] });

    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(onRestore).not.toHaveBeenCalled();
  });

  it("redoes an undone edit from the state the undo left", () => {
    const { result, onRestore, edit, rerender } = setup();
    edit([AND], 1);
    act(() => result.current.undo());
    rerender({ tokens: [], caretIndex: 0 });

    act(() => result.current.redo());

    expect(onRestore).toHaveBeenLastCalledWith({ tokens: [AND], caret: 1 });
  });

  it("forgets the redo steps once a new edit is recorded", () => {
    const { result, onRestore, edit, rerender } = setup();
    edit([AND]);
    act(() => result.current.undo());
    rerender({ tokens: [], caretIndex: 0 });
    edit([OR]);

    act(() => result.current.redo());

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("records the same tokens only once", () => {
    const tokens = [AND];
    const { result, onRestore, edit } = setup({ tokens });
    act(() => result.current.record());
    edit([AND, OR]);

    act(() => result.current.undo());
    act(() => result.current.undo());

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("keeps the edits of one group as a single step", () => {
    const { result, onRestore, edit } = setup({ tokens: [AND] });
    edit([OR], 1, "pill-edit-1");
    edit([OPEN_PAREN], 1, "pill-edit-1");
    edit([CLOSE_PAREN], 1, "pill-edit-1");

    act(() => result.current.undo());

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onRestore).toHaveBeenCalledWith({ tokens: [AND], caret: 1 });
  });

  it("starts a new step for another group", () => {
    const { result, onRestore, edit } = setup({ tokens: [AND] });
    edit([OR], 1, "pill-edit-1");
    edit([OPEN_PAREN], 1, "pill-edit-2");

    act(() => result.current.undo());

    expect(onRestore).toHaveBeenCalledWith({ tokens: [OR], caret: 1 });
  });

  it("discards the step of a group that was given up", () => {
    const { result, onRestore, edit } = setup({ tokens: [AND] });
    edit([OR], 1, "pill-edit-1");
    act(() => result.current.discard("pill-edit-1"));

    act(() => result.current.undo());

    expect(onRestore).not.toHaveBeenCalled();
  });

  it("keeps a step of another group on discard", () => {
    const { result, onRestore, edit } = setup({ tokens: [AND] });
    edit([OR], 1);
    act(() => result.current.discard("pill-edit-1"));

    act(() => result.current.undo());

    expect(onRestore).toHaveBeenCalledWith({ tokens: [AND], caret: 1 });
  });

  it("forgets everything on reset", () => {
    const { result, onRestore, edit, rerender } = setup();
    edit([AND]);
    act(() => result.current.undo());
    rerender({ tokens: [], caretIndex: 0 });
    edit([OR]);
    act(() => result.current.reset());

    act(() => result.current.undo());
    act(() => result.current.redo());

    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  it("keeps only the most recent steps", () => {
    const { result, onRestore, edit } = setup();
    const edits = Array.from({ length: MAX_HISTORY + 5 }, (_, index) =>
      Array<Token>(index + 1).fill(AND),
    );
    edits.forEach((tokens) => edit(tokens));

    act(() => {
      edits.forEach(() => result.current.undo());
    });

    expect(onRestore).toHaveBeenCalledTimes(MAX_HISTORY);
    expect(onRestore).toHaveBeenLastCalledWith({
      tokens: Array<Token>(5).fill(AND),
      caret: 5,
    });
  });
});

describe("getHistoryAction", () => {
  const key = (overrides: Partial<Parameters<typeof getHistoryAction>[0]>) =>
    getHistoryAction({
      key: "z",
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      ...overrides,
    });

  describe("on a Mac", () => {
    beforeEach(() => {
      jest.spyOn(navigator, "platform", "get").mockReturnValue("MacIntel");
    });

    it("maps Cmd+Z to undo and Shift+Cmd+Z to redo", () => {
      expect(key({ metaKey: true })).toBe("undo");
      expect(key({ metaKey: true, shiftKey: true })).toBe("redo");
      expect(key({ metaKey: true, key: "Z", shiftKey: true })).toBe("redo");
    });

    it("leaves Ctrl+Z, Cmd+Y and Alt alone", () => {
      expect(key({ ctrlKey: true })).toBeUndefined();
      expect(key({ metaKey: true, key: "y" })).toBeUndefined();
      expect(key({ metaKey: true, altKey: true })).toBeUndefined();
    });
  });

  describe("elsewhere", () => {
    beforeEach(() => {
      jest.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
    });

    it("maps Ctrl+Z to undo and Ctrl+Shift+Z or Ctrl+Y to redo", () => {
      expect(key({ ctrlKey: true })).toBe("undo");
      expect(key({ ctrlKey: true, shiftKey: true })).toBe("redo");
      expect(key({ ctrlKey: true, key: "y" })).toBe("redo");
    });

    it("leaves Cmd+Z and plain keys alone", () => {
      expect(key({ metaKey: true })).toBeUndefined();
      expect(key({})).toBeUndefined();
    });
  });
});
