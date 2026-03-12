import { act, renderHook, waitFor } from "@testing-library/react";

import { useInitialParameterValues } from "metabase/embedding/embedding-iframe-sdk-setup/hooks/use-initial-parameter-values";

describe("useInitialParameterValues", () => {
  const mockUpdateSettings = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("with dashboard settings", () => {
    it("should update initialParameters for dashboard", async () => {
      const settings: any = {
        dashboardId: 1,
        initialParameters: { category: "electronics" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("status", "active");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: "electronics",
            status: "active",
          },
        });
      });
    });

    it("should remove parameter from initialParameters for dashboard", () => {
      const settings: any = {
        dashboardId: 1,
        initialParameters: { category: "electronics", status: "active" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.removeInitialParameterValue("status");
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({
        initialParameters: {
          category: "electronics",
        },
      });
    });

    it("should handle undefined initialParameters for dashboard", async () => {
      const settings: any = {
        dashboardId: 1,
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("category", "electronics");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: "electronics",
          },
        });
      });
    });
  });

  describe("with question settings", () => {
    it("should update initialSqlParameters for question", async () => {
      const settings: any = {
        questionId: 1,
        initialSqlParameters: { param1: "value1" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("param2", "value2");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialSqlParameters: {
            param1: "value1",
            param2: "value2",
          },
        });
      });
    });

    it("should remove parameter from initialSqlParameters for question", () => {
      const settings: any = {
        questionId: 1,
        initialSqlParameters: { param1: "value1", param2: "value2" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.removeInitialParameterValue("param2");
      });

      expect(mockUpdateSettings).toHaveBeenCalledWith({
        initialSqlParameters: {
          param1: "value1",
        },
      });
    });

    it("should handle undefined initialSqlParameters for question", async () => {
      const settings: any = {
        questionId: 1,
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("param1", "value1");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialSqlParameters: {
            param1: "value1",
          },
        });
      });
    });
  });

  describe("with neither dashboard nor question", () => {
    it("should not call updateSettings when updating", async () => {
      const settings: any = {};

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("param1", "value1");
      });

      await waitFor(
        () => {
          expect(mockUpdateSettings).not.toHaveBeenCalled();
        },
        { timeout: 1000 },
      );
    });

    it("should not call updateSettings when removing", () => {
      const settings: any = {};

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.removeInitialParameterValue("param1");
      });

      expect(mockUpdateSettings).not.toHaveBeenCalled();
    });
  });

  describe("parameter value types", () => {
    it("should handle string values", async () => {
      const settings: any = { dashboardId: 1, initialParameters: {} };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("category", "electronics");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: "electronics",
          },
        });
      });
    });

    it("should handle number values", async () => {
      const settings: any = { dashboardId: 1, initialParameters: {} };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("count", 42);
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            count: 42,
          },
        });
      });
    });

    it("should handle array values", async () => {
      const settings: any = { dashboardId: 1, initialParameters: {} };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("categories", [
          "electronics",
          "books",
        ]);
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            categories: ["electronics", "books"],
          },
        });
      });
    });

    it("should handle null values", async () => {
      const settings: any = {
        dashboardId: 1,
        initialParameters: { category: "electronics" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("category", null);
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: null,
          },
        });
      });
    });

    it("should handle undefined values", async () => {
      const settings: any = {
        dashboardId: 1,
        initialParameters: { category: "electronics" },
      };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("category", undefined);
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: undefined,
          },
        });
      });
    });
  });

  describe("debouncing", () => {
    it("should debounce updateInitialParameterValue calls", async () => {
      const settings: any = { dashboardId: 1, initialParameters: {} };

      const { result } = renderHook(() =>
        useInitialParameterValues({
          settings,
          updateSettings: mockUpdateSettings,
        }),
      );

      act(() => {
        result.current.updateInitialParameterValue("category", "electronics");
        result.current.updateInitialParameterValue("category", "books");
        result.current.updateInitialParameterValue("category", "toys");
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledTimes(1);
      });

      await waitFor(() => {
        expect(mockUpdateSettings).toHaveBeenCalledWith({
          initialParameters: {
            category: "toys",
          },
        });
      });
    });
  });
});
