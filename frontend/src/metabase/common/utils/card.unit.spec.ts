import {
  deserializeCardFromQuery,
  serializeCardForUrl,
} from "metabase/common/utils/card";
import { b64url_to_utf8, utf8_to_b64url } from "metabase/utils/encoding";
import { createMockCard } from "metabase-types/api/mocks";

describe("serializeCardForUrl", () => {
  it("should preserve the card type in the serialized payload (metabase#34517)", () => {
    const card = createMockCard({ type: "model" });

    const serialized = serializeCardForUrl(card);
    const decoded = JSON.parse(b64url_to_utf8(serialized));

    expect(decoded.type).toBe("model");
  });
});

describe("deserializeCardFromQuery", () => {
  const MBQL_QUERY = {
    database: 1,
    type: "query",
    query: { "source-table": 2 },
  };
  const CARD_PAYLOAD = {
    dataset_query: MBQL_QUERY,
    display: "bar",
    visualization_settings: {},
  };
  const WRAPPED_B64 = utf8_to_b64url(JSON.stringify(CARD_PAYLOAD));

  it("should strip /question# prefix and decode the payload", () => {
    expect(deserializeCardFromQuery(`/question#${WRAPPED_B64}`)).toEqual(
      CARD_PAYLOAD,
    );
  });
});
