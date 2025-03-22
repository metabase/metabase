import { waitFor } from "@testing-library/react";

import {
  callsToTranslateEntityIdEndpoint,
  setupTranslateEntityIdEndpoint,
} from "__support__/server-mocks/entity-ids";
import { renderHookWithProviders } from "__support__/ui";
import type { BaseEntityId } from "metabase-types/api";

import { useValidatedEntityId } from "./use-validated-entity-id";

describe("useValidatedEntityId", () => {
  it("should pass through numeric IDs without calling the translation endpoint", () => {
    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: 123 }),
    );

    expect(result.current).toEqual({
      id: 123,
      isLoading: false,
      isError: false,
    });

    expect(callsToTranslateEntityIdEndpoint()).toHaveLength(0);
  });

  it("should handle undefined ID", () => {
    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: undefined }),
    );

    expect(result.current).toEqual({
      id: null,
      isLoading: false,
      isError: true,
    });
  });

  it("should handle null ID", () => {
    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: null }),
    );

    expect(result.current).toEqual({
      id: null,
      isLoading: false,
      isError: true,
    });
  });

  it("should handle invalid entity ID strings", () => {
    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: "not-an-entity-id" }),
    );

    expect(result.current).toEqual({
      id: null,
      isLoading: false,
      isError: true,
    });
  });

  it("should translate card entity IDs correctly", async () => {
    const validEntityId = "2".repeat(21) as BaseEntityId;

    setupTranslateEntityIdEndpoint({
      [validEntityId]: {
        type: "card",
        status: "ok",
        id: 123,
      },
    });

    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: validEntityId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      id: 123,
      isLoading: false,
      isError: false,
    });
  });

  it("should translate dashboard entity IDs correctly", async () => {
    const validEntityId = "3".repeat(21) as BaseEntityId;

    setupTranslateEntityIdEndpoint({
      [validEntityId]: {
        type: "dashboard",
        status: "ok",
        id: 456,
      },
    });

    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "dashboard", id: validEntityId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      id: 456,
      isLoading: false,
      isError: false,
    });
  });

  it("should translate collection entity IDs correctly", async () => {
    const validEntityId = "4".repeat(21) as BaseEntityId;

    setupTranslateEntityIdEndpoint({
      [validEntityId]: {
        type: "collection",
        status: "ok",
        id: 789,
      },
    });

    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "collection", id: validEntityId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      id: 789,
      isLoading: false,
      isError: false,
    });
  });

  it("should handle failed translations", async () => {
    const invalidEntityId = "5".repeat(21) as BaseEntityId;

    setupTranslateEntityIdEndpoint({
      [invalidEntityId]: {
        type: "card",
        status: "not-found",
        id: null,
      },
    });

    const { result } = renderHookWithProviders(() =>
      useValidatedEntityId({ type: "card", id: invalidEntityId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current).toEqual({
      id: null,
      isLoading: false,
      isError: true,
    });
  });
});
