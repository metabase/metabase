import { act, renderHook, waitFor } from "@testing-library/react";

import { usePageTitle } from "./use-page-title";

describe("usePageTitle", () => {
  beforeEach(() => {
    document.title = "";
  });

  it("should set a simple title", async () => {
    renderHook(() => usePageTitle("Test Page"));
    await waitFor(() => {
      expect(document.title).toBe("Test Page");
    });
  });

  it("should update title when value changes", async () => {
    const { rerender } = renderHook(({ title }) => usePageTitle(title), {
      initialProps: { title: "First Title" },
    });

    await waitFor(() => {
      expect(document.title).toBe("First Title");
    });

    rerender({ title: "Second Title" });
    await waitFor(() => {
      expect(document.title).toBe("Second Title");
    });
  });

  it("should stack titles with separator", async () => {
    const { unmount: unmount1 } = renderHook(() =>
      usePageTitle("Metabase", { titleIndex: 0 }),
    );
    const { unmount: unmount2 } = renderHook(() =>
      usePageTitle("Admin", { titleIndex: 0 }),
    );
    const { unmount: unmount3 } = renderHook(() =>
      usePageTitle("Databases", { titleIndex: 1 }),
    );

    await waitFor(() => {
      expect(document.title).toBe("Databases · Admin · Metabase");
    });

    // Cleanup
    unmount3();
    unmount2();
    unmount1();
  });

  it("should respect titleIndex ordering", async () => {
    const { unmount: unmount1 } = renderHook(() =>
      usePageTitle("Root", { titleIndex: 0 }),
    );
    const { unmount: unmount2 } = renderHook(() =>
      usePageTitle("Parent", { titleIndex: 0 }),
    );
    const { unmount: unmount3 } = renderHook(() =>
      usePageTitle("Child", { titleIndex: 1 }),
    );

    // After sort by titleIndex and reverse:
    // titleIndex 0: Root, Parent
    // titleIndex 1: Child
    // Result after reverse: Child · Parent · Root
    await waitFor(() => {
      expect(document.title).toBe("Child · Parent · Root");
    });

    unmount3();
    unmount2();
    unmount1();
  });

  it("should clean up title on unmount", async () => {
    const { unmount: unmount1 } = renderHook(() => usePageTitle("Keep This"));
    const { unmount: unmount2 } = renderHook(() => usePageTitle("Remove This"));

    await waitFor(() => {
      expect(document.title).toBe("Remove This · Keep This");
    });

    unmount2();
    await waitFor(() => {
      expect(document.title).toBe("Keep This");
    });

    unmount1();
    await waitFor(() => {
      expect(document.title).toBe("");
    });
  });

  it("should handle function titles", async () => {
    const getTitleFn = () => "Function Title";
    renderHook(() => usePageTitle(getTitleFn));
    await waitFor(() => {
      expect(document.title).toBe("Function Title");
    });
  });

  it("should filter out empty titles", async () => {
    const { unmount: unmount1 } = renderHook(() => usePageTitle("Valid"));
    const { unmount: unmount2 } = renderHook(() => usePageTitle(""));

    // Empty title should be filtered out
    await waitFor(() => {
      expect(document.title).toBe("Valid");
    });

    unmount2();
    unmount1();
  });

  it("should handle async refresh", async () => {
    let resolvePromise: () => void;
    const refreshPromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });

    let titleValue = "Initial";
    const getTitleFn = () => titleValue;

    renderHook(() => usePageTitle(getTitleFn, { refresh: refreshPromise }));

    await waitFor(() => {
      expect(document.title).toBe("Initial");
    });

    // Update title value and resolve promise
    titleValue = "Updated";
    await act(async () => {
      resolvePromise!();
      // Wait for promise to resolve
      await refreshPromise;
    });

    await waitFor(() => {
      expect(document.title).toBe("Updated");
    });
  });
});
