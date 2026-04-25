import { deserializeCardFromQuery } from "metabase/common/utils/card";
import { utf8_to_b64url } from "metabase/utils/encoding";

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
