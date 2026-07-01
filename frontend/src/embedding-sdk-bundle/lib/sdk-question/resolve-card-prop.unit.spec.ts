import type { MetabaseCard } from "embedding-sdk-bundle/types/question";
import { utf8_to_b64url } from "metabase/utils/encoding";
import type { DatasetQuery } from "metabase-types/api";

import { resolveCardProp } from "./resolve-card-prop";

const DATASET_QUERY: DatasetQuery = {
  database: 1,
  type: "query",
  query: { "source-table": 2 },
};

const serialize = (card: object) => utf8_to_b64url(JSON.stringify(card));

describe("resolveCardProp", () => {
  it("parses a bare base64 string", () => {
    const card = resolveCardProp(serialize({ dataset_query: DATASET_QUERY }));

    expect(card?.dataset_query).toEqual(DATASET_QUERY);
  });

  it("parses a `/question#<base64>` prefixed string", () => {
    const card = resolveCardProp(
      "/question#" + serialize({ dataset_query: DATASET_QUERY }),
    );

    expect(card?.dataset_query).toEqual(DATASET_QUERY);
  });

  it("returns null and warns for an unparseable string", () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});

    expect(resolveCardProp("not-a-real-card")).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("could not be parsed"),
    );

    warn.mockRestore();
  });

  it("maps a camelCase MetabaseCard object to a snake_case Card", () => {
    const input: MetabaseCard = {
      query: DATASET_QUERY,
      visualization: "bar",
      visualizationSettings: { "graph.dimensions": ["x"] },
    };

    const card = resolveCardProp(input);

    expect(card).toEqual({
      dataset_query: DATASET_QUERY,
      display: "bar",
      displayIsLocked: true,
      visualization_settings: { "graph.dimensions": ["x"] },
    });
  });

  it("uses an unlocked table display when `visualization` is omitted", () => {
    const input: MetabaseCard = {
      query: DATASET_QUERY,
    };

    const card = resolveCardProp(input);

    expect(card).toEqual({
      dataset_query: DATASET_QUERY,
      display: "table",
      visualization_settings: {},
    });
  });

  it("respects an explicit `displayIsLocked: false`", () => {
    const card = resolveCardProp({
      query: DATASET_QUERY,
      visualization: "bar",
      visualizationSettings: {},
      displayIsLocked: false,
    });

    expect(card?.displayIsLocked).toBe(false);
  });
});
