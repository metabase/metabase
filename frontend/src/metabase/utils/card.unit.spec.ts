import {
  deserializeCardFromQuery,
  deserializeCardFromUrl,
  serializeCardForUrl,
} from "metabase/utils/card";
import {
  b64_to_utf8,
  b64url_to_utf8,
  utf8_to_b64,
  utf8_to_b64url,
} from "metabase/utils/encoding";
import type { Card, UnsavedCard } from "metabase-types/api";

const CARD_ID = 31;

// TODO Atte Keinänen 8/5/17: Create a reusable version `getCard` for reducing test code duplication
interface GetCardOpts {
  newCard?: boolean;
  hasOriginalCard?: boolean;
  isNative?: boolean;
  database?: number;
  display?: string;
  queryFields?: Record<string, unknown>;
  table?: number;
}

const getCard = ({
  newCard = false,
  hasOriginalCard = false,
  isNative = false,
  database = 1,
  display = "table",
  queryFields = {},
  table = undefined,
}: GetCardOpts = {}): Card | UnsavedCard => {
  const savedCardFields = {
    name: "Example Saved Question",
    description: "For satisfying your craving for information",
    created_at: "2017-04-20T16:52:55.353Z",
    id: CARD_ID,
  };

  return {
    name: null,
    display: display,
    visualization_settings: {},
    dataset_query: {
      database: database,
      type: isNative ? "native" : "query",
      ...(!isNative
        ? {
            query: {
              ...(table ? { "source-table": table } : {}),
              ...queryFields,
            },
          }
        : {}),
      ...(isNative
        ? {
            native: { query: "SELECT * FROM ORDERS" },
          }
        : {}),
    },
    ...(newCard ? {} : savedCardFields),
    ...(hasOriginalCard ? { original_card_id: CARD_ID } : {}),
  } as Card | UnsavedCard;
};

describe("lib/card", () => {
  describe("utf8_to_b64", () => {
    it("should encode with non-URL-safe characters", () => {
      expect(utf8_to_b64("  ?").indexOf("/")).toEqual(3);
      expect(utf8_to_b64("  ?")).toEqual("ICA/");
    });
  });

  describe("b64_to_utf8", () => {
    it("should decode correctly", () => {
      expect(b64_to_utf8("ICA/")).toEqual("  ?");
    });
  });

  describe("utf8_to_b64url", () => {
    it("should encode with URL-safe characters", () => {
      expect(utf8_to_b64url("  ?").indexOf("/")).toEqual(-1);
      expect(utf8_to_b64url("  ?")).toEqual("ICA_");
    });
  });

  describe("b64url_to_utf8", () => {
    it("should decode correctly", () => {
      expect(b64url_to_utf8("ICA_")).toEqual("  ?");
    });
  });

  describe("serializeCardForUrl", () => {
    it("should include `original_card_id` property to the serialized URL", () => {
      const cardAfterSerialization = deserializeCardFromUrl(
        serializeCardForUrl(getCard({ hasOriginalCard: true })),
      );
      expect(cardAfterSerialization).toHaveProperty(
        "original_card_id",
        CARD_ID,
      );
    });
  });

  describe("deserializeCardFromQuery", () => {
    const MBQL_QUERY = {
      database: 1,
      type: "query",
      query: { "source-table": 2 },
    };
    const RAW_B64 = utf8_to_b64url(JSON.stringify(MBQL_QUERY));
    const WRAPPED_B64 = utf8_to_b64url(
      JSON.stringify({ dataset_query: MBQL_QUERY }),
    );

    it("should wrap a raw pMBQL query in { dataset_query: ... }", () => {
      expect(deserializeCardFromQuery(RAW_B64)).toEqual({
        dataset_query: MBQL_QUERY,
      });
    });

    it("should strip /question# prefix and wrap the payload", () => {
      expect(deserializeCardFromQuery(`/question#${RAW_B64}`)).toEqual({
        dataset_query: MBQL_QUERY,
      });
    });

    it("should strip question# prefix (no leading slash) and wrap the payload", () => {
      expect(deserializeCardFromQuery(`question#${RAW_B64}`)).toEqual({
        dataset_query: MBQL_QUERY,
      });
    });

    it("should strip # prefix and wrap the payload", () => {
      expect(deserializeCardFromQuery(`#${RAW_B64}`)).toEqual({
        dataset_query: MBQL_QUERY,
      });
    });

    it("should return a payload already containing dataset_query as-is", () => {
      expect(deserializeCardFromQuery(WRAPPED_B64)).toEqual({
        dataset_query: MBQL_QUERY,
      });
    });
  });
});
