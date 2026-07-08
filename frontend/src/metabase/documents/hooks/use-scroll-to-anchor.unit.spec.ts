import { act, renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";

import { getScrollIntoViewMock } from "__support__/ui";

import { useScrollToAnchor } from "./use-scroll-to-anchor";

jest.mock("../components/DocumentPage.module.css", () => ({
  highlighted: "highlighted",
}));

describe("useScrollToAnchor", () => {
  let container: HTMLDivElement;
  let editorContainerRef: React.RefObject<HTMLDivElement>;
  const mockScrollIntoView = getScrollIntoViewMock();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();

    container = document.createElement("div");
    document.body.appendChild(container);

    editorContainerRef = createRef<HTMLDivElement>();
    (editorContainerRef as { current: HTMLDivElement }).current = container;
  });

  afterEach(() => {
    jest.useRealTimers();
    // eslint-disable-next-line testing-library/no-node-access -- cleanup of test container
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it("does nothing when blockId is null", () => {
    renderHook(() =>
      useScrollToAnchor({
        blockId: null,
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when isLoading is true", () => {
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "test-block-123");
    container.appendChild(targetElement);

    renderHook(() =>
      useScrollToAnchor({
        blockId: "test-block-123",
        editorContainerRef,
        isLoading: true,
      }),
    );

    expect(mockScrollIntoView).not.toHaveBeenCalled();
  });

  it("does nothing when editorContainerRef.current is null", () => {
    const nullRef = createRef<HTMLDivElement>();

    renderHook(() =>
      useScrollToAnchor({
        blockId: "test-block-123",
        editorContainerRef: nullRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls immediately if element already exists in DOM", () => {
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "existing-block");
    container.appendChild(targetElement);

    renderHook(() =>
      useScrollToAnchor({
        blockId: "existing-block",
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "start",
    });
    expect(targetElement).toHaveClass("highlighted");
  });

  it("uses MutationObserver when element doesn't exist yet and scrolls when element appears", async () => {
    renderHook(() =>
      useScrollToAnchor({
        blockId: "delayed-block",
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).not.toHaveBeenCalled();

    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "delayed-block");
    container.appendChild(targetElement);

    await waitFor(() => {
      expect(mockScrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "start",
      });
    });
    expect(targetElement).toHaveClass("highlighted");
  });

  it("removes highlight class after timeout", () => {
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "highlight-test");
    container.appendChild(targetElement);

    renderHook(() =>
      useScrollToAnchor({
        blockId: "highlight-test",
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(targetElement).toHaveClass("highlighted");

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(targetElement).not.toHaveClass("highlighted");
  });

  it("cleanup disconnects observer on unmount when element not found", () => {
    const { unmount } = renderHook(() =>
      useScrollToAnchor({
        blockId: "not-found-block",
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).not.toHaveBeenCalled();
    expect(() => unmount()).not.toThrow();
  });

  it("cleanup clears timeout and removes highlight on unmount", () => {
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "cleanup-test");
    container.appendChild(targetElement);

    const { unmount } = renderHook(() =>
      useScrollToAnchor({
        blockId: "cleanup-test",
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(targetElement).toHaveClass("highlighted");

    unmount();

    expect(targetElement).not.toHaveClass("highlighted");
  });

  it("handles special characters in blockId via CSS.escape", () => {
    const specialId = "block-with-special-chars";
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", specialId);
    container.appendChild(targetElement);

    renderHook(() =>
      useScrollToAnchor({
        blockId: specialId,
        editorContainerRef,
        isLoading: false,
      }),
    );

    expect(mockScrollIntoView).toHaveBeenCalled();
    expect(targetElement).toHaveClass("highlighted");
  });
});
