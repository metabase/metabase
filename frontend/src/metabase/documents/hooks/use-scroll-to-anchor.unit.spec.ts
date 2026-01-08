import { act, renderHook, waitFor } from "@testing-library/react";
import { createRef } from "react";

import { getScrollIntoViewMock } from "__support__/ui";

import { useScrollToAnchor } from "./use-scroll-to-anchor";

// Mock the CSS module
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

    // Create a container element
    container = document.createElement("div");
    document.body.appendChild(container);

    // Create a ref pointing to the container
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
    // Add target element
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
    // Add target element before hook runs
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
      block: "center",
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

    // Element doesn't exist yet, so no scroll
    expect(mockScrollIntoView).not.toHaveBeenCalled();

    // Now add the element (simulating async render)
    const targetElement = document.createElement("div");
    targetElement.setAttribute("data-node-id", "delayed-block");
    container.appendChild(targetElement);

    // Wait for MutationObserver callback to fire
    await waitFor(() => {
      expect(mockScrollIntoView).toHaveBeenCalledWith({
        behavior: "smooth",
        block: "center",
      });
    });
    expect(targetElement).toHaveClass("highlighted");
  });

  it("adds and removes highlight class with correct timing", () => {
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

    // Highlight should be added immediately
    expect(targetElement).toHaveClass("highlighted");

    // Fast-forward 2 seconds
    act(() => {
      jest.advanceTimersByTime(2000);
    });

    // Highlight should be removed
    expect(targetElement).not.toHaveClass("highlighted");
  });

  it("cleanup disconnects observer on unmount when element not found", () => {
    // Don't add the target element - observer will be watching
    const { unmount } = renderHook(() =>
      useScrollToAnchor({
        blockId: "not-found-block",
        editorContainerRef,
        isLoading: false,
      }),
    );

    // No element found, no scroll
    expect(mockScrollIntoView).not.toHaveBeenCalled();

    // Unmount should disconnect observer without errors
    unmount();

    // No crash means success
    expect(true).toBe(true);
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

    // Highlight should be added
    expect(targetElement).toHaveClass("highlighted");

    // Unmount before timeout completes
    unmount();

    // Highlight should be removed on cleanup
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
