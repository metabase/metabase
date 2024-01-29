import type { NativeDatasetQuery } from "metabase-types/api";

import { getDefaultDisplay } from "./display";
import { SAMPLE_DATABASE, createQuery } from "./test-helpers";

describe("getDefaultDisplay", () => {
  it("returns 'table' display for native queries", () => {
    const nativeQuery: NativeDatasetQuery = {
      database: SAMPLE_DATABASE.id,
      type: "native",
      native: {
        query: "select 1",
      },
    };
    const query = createQuery({ query: nativeQuery });

    expect(getDefaultDisplay(query)).toEqual({ display: "table" });
  });
});
