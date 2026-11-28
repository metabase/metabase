import { act, render, screen } from "@testing-library/react";
import { type RefObject, useRef } from "react";

import { useFocusFallback } from "./use-focus-fallback";

function Panel({
  fallbackRef,
}: {
  fallbackRef: RefObject<HTMLInputElement | null>;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusFallback(panelRef, fallbackRef);
  return (
    <div ref={panelRef}>
      <button>Inside</button>
    </div>
  );
}

function Harness({ hasPanel }: { hasPanel: boolean }) {
  const fallbackRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input ref={fallbackRef} aria-label="Fallback" />
      <button>Outside</button>
      {hasPanel && <Panel fallbackRef={fallbackRef} />}
    </>
  );
}

function setup() {
  const { rerender } = render(<Harness hasPanel />);
  const removePanel = () => rerender(<Harness hasPanel={false} />);
  return { removePanel };
}

describe("useFocusFallback", () => {
  it("moves the focus to the fallback when the container goes away with the focus in it", async () => {
    const { removePanel } = setup();
    act(() => screen.getByRole("button", { name: "Inside" }).focus());

    removePanel();
    await act(() => Promise.resolve());

    expect(screen.getByLabelText("Fallback")).toHaveFocus();
  });

  it("leaves the focus on the page body when the container goes away without the focus", async () => {
    const { removePanel } = setup();

    removePanel();
    await act(() => Promise.resolve());

    expect(document.body).toHaveFocus();
  });

  it("keeps the focus on an element that takes it right after the container goes away", async () => {
    const { removePanel } = setup();
    act(() => screen.getByRole("button", { name: "Inside" }).focus());
    const outside = screen.getByRole("button", { name: "Outside" });

    removePanel();
    act(() => outside.focus());
    await act(() => Promise.resolve());

    expect(outside).toHaveFocus();
  });
});
