import { fireEvent, renderHook } from "@testing-library/react";

import { useJevFilterHotkey } from "./use-jev-filter-hotkey";

function setup({ enabled = true, isOpen = false } = {}) {
  const onOpen = jest.fn();
  renderHook(() => useJevFilterHotkey({ enabled, isOpen, onOpen }));
  return { onOpen };
}

function pressCtrlF(target: Element | Window = window) {
  // `fireEvent` returns false when a handler called `preventDefault`.
  return fireEvent.keyDown(target, { key: "f", ctrlKey: true });
}

describe("useJevFilterHotkey", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens and suppresses the browser's find", () => {
    const { onOpen } = setup();

    expect(pressCtrlF()).toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("ignores other chords", () => {
    const { onOpen } = setup();

    fireEvent.keyDown(window, { key: "f" });
    fireEvent.keyDown(window, { key: "f", ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: "g", ctrlKey: true });

    expect(onOpen).not.toHaveBeenCalled();
  });

  it.each(["input", "textarea"])(
    "leaves the browser's find alone while a %s is focused",
    (tagName) => {
      const { onOpen } = setup();
      const element = document.createElement(tagName);
      document.body.appendChild(element);
      element.focus();

      expect(pressCtrlF(element)).toBe(true);
      expect(onOpen).not.toHaveBeenCalled();
    },
  );

  it("leaves the browser's find alone inside a contenteditable editor", () => {
    const { onOpen } = setup();
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    editor.tabIndex = 0;
    document.body.appendChild(editor);
    editor.focus();

    expect(pressCtrlF(editor)).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("only swallows the chord while already open", () => {
    const { onOpen } = setup({ isOpen: true });

    expect(pressCtrlF()).toBe(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const { onOpen } = setup({ enabled: false });

    expect(pressCtrlF()).toBe(true);
    expect(onOpen).not.toHaveBeenCalled();
  });
});
