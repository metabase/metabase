import { act, renderHook } from "__support__/ui";

import { getStoredSidePanelWidth, setStoredSidePanelWidth } from "./storage";
import { useSidePanelWidth } from "./useSidePanelWidth";

type Options = Parameters<typeof useSidePanelWidth>[0];

const DEFAULT_OPTIONS: Options = {
  storageKey: "test-panel",
  defaultWidth: 320,
  minWidth: 224,
  maxWidth: 384,
};

const setup = (options: Partial<Options> = {}) =>
  renderHook((props: Options) => useSidePanelWidth(props), {
    initialProps: { ...DEFAULT_OPTIONS, ...options },
  });

describe("useSidePanelWidth", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("starts at the default width when nothing is remembered", () => {
    const { result } = setup();

    expect(result.current.width).toBe(320);
  });

  it("starts at the width the user last resized to", () => {
    setStoredSidePanelWidth("test-panel", 350);

    const { result } = setup();

    expect(result.current.width).toBe(350);
  });

  it.each([
    [100, 224],
    [900, 384],
  ])(
    "clamps a remembered width of %i to the current limits",
    (stored, expected) => {
      setStoredSidePanelWidth("test-panel", stored);

      const { result } = setup();

      expect(result.current.width).toBe(expected);
    },
  );

  it("does not persist while the user is dragging", () => {
    const { result } = setup();

    act(() => result.current.setWidth(350));

    expect(result.current.width).toBe(350);
    expect(getStoredSidePanelWidth("test-panel")).toBeUndefined();
  });

  it("remembers a width that differs from the default", () => {
    const { result } = setup();

    act(() => result.current.persistWidth(350));

    expect(getStoredSidePanelWidth("test-panel")).toBe(350);
  });

  it("forgets the width when resized back to the default", () => {
    setStoredSidePanelWidth("test-panel", 350);
    const { result } = setup();

    act(() => result.current.persistWidth(320));

    expect(getStoredSidePanelWidth("test-panel")).toBeUndefined();
  });

  it("neither reads nor writes storage without a storage key", () => {
    setStoredSidePanelWidth("test-panel", 350);
    const { result } = setup({ storageKey: undefined });

    expect(result.current.width).toBe(320);

    act(() => result.current.persistWidth(300));

    expect(getStoredSidePanelWidth("test-panel")).toBe(350);
  });

  it("switches to the other panel's remembered width when the key changes", () => {
    setStoredSidePanelWidth("other-panel", 260);
    const { result, rerender } = setup();

    act(() => result.current.setWidth(350));
    rerender({ ...DEFAULT_OPTIONS, storageKey: "other-panel" });

    expect(result.current.width).toBe(260);
  });

  it("resets to the new default when the default width changes", () => {
    const { result, rerender } = setup();

    act(() => result.current.setWidth(350));
    rerender({ ...DEFAULT_OPTIONS, defaultWidth: 300 });

    expect(result.current.width).toBe(300);
  });
});
