import type { Card, UnsavedCard } from "metabase-types/api";
import { createMockCard } from "metabase-types/api/mocks";
import { createMockEntityId } from "metabase-types/api/mocks/entity-id";

import { isSavedCard } from "./card";

describe("isSavedCard", () => {
  describe("returns true for saved cards", () => {
    it("should return true for card with positive numeric id", () => {
      const card: Card = createMockCard({
        id: 1,
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
        name: "Test Card",
        description: null,
        type: "question",
        public_uuid: null,
        display: "table",
        visualization_settings: {},
      });

      expect(isSavedCard(card)).toBe(true);
    });

    it("should return true for card with string id (entity id)", () => {
      const card = createMockCard({
        // @ts-expect-error -- typing for Card does not include string ids
        id: createMockEntityId(),
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
        name: "Test Card",
        description: null,
        type: "question",
        public_uuid: null,
        display: "table",
        visualization_settings: {},
      });

      expect(isSavedCard(card)).toBe(true);
    });

    it("should return true for card with large positive numeric id", () => {
      const card: Card = {
        id: 999999,
        entity_id: "entity-123",
        created_at: "2023-01-01T00:00:00Z",
        updated_at: "2023-01-01T00:00:00Z",
        name: "Test Card",
        description: null,
        type: "question",
        public_uuid: null,
        dataset_query: { type: "query" },
        display: "table",
        visualization_settings: {},
      } as Card;

      expect(isSavedCard(card)).toBe(true);
    });
  });

  describe("returns false for unsaved cards", () => {
    it("should return false for card without id property", () => {
      const card: UnsavedCard = {
        display: "table",
        visualization_settings: {},
        dataset_query: {
          type: "native",
          native: { query: "select * from table_name" },
          database: null,
        },
      };

      expect(isSavedCard(card)).toBe(false);
    });

    it("should return false for card with null id", () => {
      const card = {
        id: null,
        name: "Card with null id",
        description: null,
        type: "question",
        dataset_query: { type: "query" },
        display: "table",
        visualization_settings: {},
      } as any;

      expect(isSavedCard(card)).toBe(false);
    });

    it("should return false for card with undefined id", () => {
      const card = {
        id: undefined,
        name: "Card with undefined id",
        description: null,
        type: "question",
        dataset_query: { type: "query" },
        display: "table",
        visualization_settings: {},
      } as any;

      expect(isSavedCard(card)).toBe(false);
    });

    it("should return false for card with zero id", () => {
      const card = {
        id: 0,
        name: "Card with zero id",
        description: null,
        type: "question",
        dataset_query: { type: "query" },
        display: "table",
        visualization_settings: {},
      } as any;

      expect(isSavedCard(card)).toBe(false);
    });

    it("should return false for card with negative numeric id (temporary card)", () => {
      const card = {
        id: -1,
        name: "Temporary Card",
        description: null,
        type: "question",
        dataset_query: { type: "query" },
        display: "table",
        visualization_settings: {},
      } as any;

      expect(isSavedCard(card)).toBe(false);
    });
  });
});
