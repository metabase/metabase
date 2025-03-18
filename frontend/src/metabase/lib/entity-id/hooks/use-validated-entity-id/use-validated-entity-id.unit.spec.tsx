import { match } from "ts-pattern";

import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { Loader } from "metabase/ui";
import {
  createMockCard,
  createMockCollection,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { setupTranslateEntityIdEndpoints } from "./entity-ids";
import {
  type UseTranslateEntityIdProps,
  useValidatedEntityId,
} from "./use-validated-entity-id";

const TestComponent = ({ type, id }: UseTranslateEntityIdProps) => {
  const result = useValidatedEntityId({ type, id });

  if (result.isLoading) {
    return <Loader data-testid="loading-indicator" />;
  }

  return (
    <div>
      <div data-testid="entity-id">
        {result.id !== null ? result.id.toString() : "null"}
      </div>
      <div data-testid="is-loading">{result.isLoading.toString()}</div>
      <div data-testid="is-error">{result.isError.toString()}</div>
    </div>
  );
};

interface SetupProps extends UseTranslateEntityIdProps {}

const MOCK_CARD = createMockCard();
const MOCK_DASHBOARD = createMockDashboard();
const MOCK_COLLECTION = createMockCollection();

const setup = ({ type = "card", id = null }: Partial<SetupProps> = {}) => {
  const mockData = match(type)
    .with("dashboard", type => ({ type, data: [MOCK_DASHBOARD] }))
    .with("collection", type => ({ type, data: [MOCK_COLLECTION] }))
    .otherwise(type => ({ type, data: [MOCK_CARD] }));

  setupTranslateEntityIdEndpoints(mockData);

  renderWithProviders(<TestComponent type={type} id={id} />);

  const getHookResult = () => {
    const entityId = screen.getByTestId("entity-id").textContent;
    const isLoading = screen.getByTestId("is-loading").textContent === "true";
    const isError = screen.getByTestId("is-error").textContent === "true";

    return {
      id: entityId === "null" ? null : Number(entityId),
      isLoading,
      isError,
    };
  };

  return {
    getHookResult,
  };
};

describe("useValidatedEntityId", () => {
  describe("handling numeric IDs", () => {
    it("should return the numeric ID directly without translation", () => {
      const { getHookResult } = setup({ id: 123 });

      expect(getHookResult()).toEqual({
        id: 123,
        isLoading: false,
        isError: false,
      });
    });

    it("should convert stringified numbers to numeric IDs", () => {
      const { getHookResult } = setup({ id: "456" });

      expect(getHookResult()).toEqual({
        id: 456,
        isLoading: false,
        isError: false,
      });
    });
  });

  describe("handling entity IDs", () => {
    it("should return loading state initially and then translated ID when API responds", async () => {
      const entityId = MOCK_CARD.entity_id;
      const translatedId = MOCK_CARD.id;

      const { getHookResult } = setup({
        id: entityId,
      });

      await waitForLoaderToBeRemoved();

      expect(getHookResult()).toEqual({
        id: translatedId,
        isLoading: false,
        isError: false,
      });
    });

    it("should return error state when translation fails", async () => {
      const entityId = "oisin";

      const { getHookResult } = setup({
        type: "collection",
        id: entityId,
      });

      await waitForLoaderToBeRemoved();

      expect(getHookResult()).toEqual({
        id: null,
        isLoading: false,
        isError: true,
      });
    });

    it("should return error state when API request fails", async () => {
      const entityId = "oisin";

      const { getHookResult } = setup({
        type: "dashboard",
        id: entityId,
      });

      await waitForLoaderToBeRemoved();

      // Should have error state
      expect(getHookResult()).toEqual({
        id: null,
        isLoading: false,
        isError: true,
      });
    });
  });

  describe("handling invalid or null IDs", () => {
    it("should return error state for undefined ID", () => {
      const { getHookResult } = setup({ id: undefined });

      expect(getHookResult()).toEqual({
        id: null,
        isLoading: false,
        isError: true,
      });
    });

    it("should return error state for null ID", () => {
      const { getHookResult } = setup({ id: null });

      expect(getHookResult()).toEqual({
        id: null,
        isLoading: false,
        isError: true,
      });
    });

    it("should return error state for non-entity ID strings", () => {
      const { getHookResult } = setup({ id: "not-an-entity-id" });

      expect(getHookResult()).toEqual({
        id: null,
        isLoading: false,
        isError: true,
      });
    });
  });

  describe("handling different entity types", () => {
    it("should handle card entity IDs correctly", async () => {
      const entityId = MOCK_CARD.entity_id;
      const translatedId = MOCK_CARD.id;

      const { getHookResult } = setup({
        type: "card",
        id: entityId,
      });

      await waitFor(() => expect(getHookResult().isLoading).toBe(false));

      expect(getHookResult()).toEqual({
        id: translatedId,
        isLoading: false,
        isError: false,
      });
    });

    it("should handle dashboard entity IDs correctly", async () => {
      const entityId = MOCK_DASHBOARD.entity_id;
      const translatedId = MOCK_DASHBOARD.id;

      const { getHookResult } = setup({
        type: "dashboard",
        id: entityId,
      });

      await waitFor(() => expect(getHookResult().isLoading).toBe(false));

      expect(getHookResult()).toEqual({
        id: translatedId,
        isLoading: false,
        isError: false,
      });
    });

    it("should handle collection entity IDs correctly", async () => {
      const entityId = MOCK_COLLECTION.entity_id;
      const translatedId = MOCK_COLLECTION.id;

      const { getHookResult } = setup({
        type: "collection",
        id: entityId,
      });

      await waitFor(() => expect(getHookResult().isLoading).toBe(false));

      expect(getHookResult()).toEqual({
        id: translatedId,
        isLoading: false,
        isError: false,
      });
    });
  });
});
