import {
  createCard,
  serializeCardForUrl,
  deserializeCardFromUrl,
} from "metabase/lib/card";
import {
  b64_to_utf8,
  b64url_to_utf8,
  utf8_to_b64,
  utf8_to_b64url,
} from "metabase/lib/encoding";

const CARD_ID = 31;

// TODO Atte Keinänen 8/5/17: Create a reusable version `getCard` for reducing test code duplication
const getCard = ({
  newCard = false,
  hasOriginalCard = false,
  isNative = false,
  database = 1,
  display = "table",
  queryFields = {},
  table = undefined,
}) => {
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
  };
};

describe("lib/card", () => {
  describe("createCard", () => {
    it("should return a new card", () => {
      expect(createCard()).toEqual({
        name: null,
        display: "table",
        visualization_settings: {},
        dataset_query: {},
      });
    });

    it("should set the name if supplied", () => {
      expect(createCard("something")).toEqual({
        name: "something",
        display: "table",
        visualization_settings: {},
        dataset_query: {},
      });
    });
  });

  describe("utf8_to_b64", () => {
    it("should encode with non-URL-safe characters", () => {
      expect(utf8_to_b64("  ?").indexOf("/")).toEqual(3);
      expect(utf8_to_b64("  ?")).toEqual("ICA/");
    });
  });

  describe("b64_to_utf8", () => {
    it("should decode corretly", () => {
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
    it("should decode corretly", () => {
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
});
