import { renderHook, waitFor } from "@testing-library/react";

import type { EngineKey } from "metabase-types/api";

import { useEngineDocMarkdownContent } from "./useEngineDocMarkdownContent";

jest.mock("docs/databases/connections/postgresql.md", () => "# Postgres doc");
jest.mock("docs/databases/connections/athena.md", () => {
  throw new Error("Failed to import file");
});

describe("useEngineDocMarkdownContent", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => {});
  });

  describe("when markdown content loads successfully", () => {
    it("should return the markdownContent", async () => {
      const { result } = renderHook(() =>
        useEngineDocMarkdownContent("postgres"),
      );
      await waitFor(() => {
        expect(result.current.markdownContent).toBeDefined();
      });

      expect(result.current.markdownContent).toContain("# Postgres doc");
      expect(result.current.loadingError).toBeUndefined();
    });

    it("should handle loading state", async () => {
      const { result } = renderHook(() =>
        useEngineDocMarkdownContent("postgres"),
      );
      expect(result.current.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current.markdownContent).toBeDefined();
      });
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("when markdown content fails to load", () => {
    it("should set loadingError and return undefined markdownContent", async () => {
      const { result } = renderHook(() =>
        useEngineDocMarkdownContent("invalid-engine" as EngineKey),
      );
      await waitFor(() => {
        expect(result.current.loadingError).toBe(
          "Failed to load detailed documentation",
        );
      });

      expect(result.current.markdownContent).toBeUndefined();
    });

    it("calls console.error when engine key is valid but import fails", async () => {
      const consoleErrorMock = jest.spyOn(console, "error");
      const { result } = renderHook(() =>
        useEngineDocMarkdownContent("athena"),
      );
      await waitFor(() => {
        expect(result.current.loadingError).toBe(
          "Failed to load detailed documentation",
        );
      });

      expect(consoleErrorMock).toHaveBeenCalledWith(
        "Failed to load documentation for engine:",
        "athena",
        expect.any(Error),
      );
      expect(result.current.markdownContent).toBeUndefined();
    });

    it("should handle loading state", async () => {
      const { result } = renderHook(() =>
        useEngineDocMarkdownContent("athena" as EngineKey),
      );
      expect(result.current.isLoading).toBe(true);
      await waitFor(() => {
        expect(result.current.loadingError).toBe(
          "Failed to load detailed documentation",
        );
      });
      expect(result.current.isLoading).toBe(false);
    });
  });
});
