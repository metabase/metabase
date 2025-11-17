import { renderHook, waitFor } from "@testing-library/react";

import { usePageTitle, usePageTitleWithLoadingTime } from "./use-page-title";

describe("usePageTitle hooks", () => {
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
      const { unmount: unmount2 } = renderHook(() =>
        usePageTitle("Remove This"),
      );

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
  });

  describe("usePageTitleWithLoadingTime", () => {
    beforeEach(() => {
      document.title = "";
    });

    it("should set title without loading time when not running", async () => {
      renderHook(() =>
        usePageTitleWithLoadingTime("Dashboard", {
          startTime: performance.now(),
          isRunning: false,
        }),
      );

      await waitFor(() => {
        expect(document.title).toBe("Dashboard");
      });
    });

    it("should set title without loading time when startTime is null", async () => {
      renderHook(() =>
        usePageTitleWithLoadingTime("Dashboard", {
          startTime: null,
          isRunning: true,
        }),
      );

      await waitFor(() => {
        expect(document.title).toBe("Dashboard");
      });
    });

    it("should not show loading time before 10 seconds", async () => {
      const startTime = performance.now();

      renderHook(() =>
        usePageTitleWithLoadingTime("Dashboard", {
          startTime,
          isRunning: true,
        }),
      );

      await waitFor(() => {
        expect(document.title).toBe("Dashboard");
      });
    });

    it("should format time as MM:SS", async () => {
      // Start time 75 seconds ago (1:15)
      const startTime = performance.now() - 75000;

      renderHook(() =>
        usePageTitleWithLoadingTime("Dashboard", {
          startTime,
          isRunning: true,
        }),
      );

      await waitFor(() => {
        expect(document.title).toBe("01:15 Dashboard");
      });
    });

    it("should stop showing loading time when isRunning becomes false", async () => {
      const startTime = performance.now() - 60000;

      const { rerender } = renderHook(
        ({ isRunning }) =>
          usePageTitleWithLoadingTime("Dashboard", {
            startTime,
            isRunning,
          }),
        { initialProps: { isRunning: true } },
      );

      await waitFor(() => {
        expect(document.title).toBe("01:00 Dashboard");
      });

      rerender({ isRunning: false });

      await waitFor(() => {
        expect(document.title).toBe("Dashboard");
      });
    });

    it("should respect titleIndex option", async () => {
      const { unmount: unmount1 } = renderHook(() =>
        usePageTitle("Metabase", { titleIndex: 0 }),
      );

      const { unmount: unmount2 } = renderHook(() =>
        usePageTitleWithLoadingTime("Dashboard", {
          titleIndex: 1,
          startTime: performance.now() - 120000, // 2 minutes ago
          isRunning: true,
        }),
      );

      await waitFor(() => {
        expect(document.title).toBe("02:00 Dashboard · Metabase");
      });

      unmount2();
      unmount1();
    });
  });
});
