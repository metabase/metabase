import {
  createMockActionDashboardCard,
  createMockCard,
  createMockDashboard,
  createMockDashboardCard,
  createMockDashboardTab,
} from "metabase-types/api/mocks";

import { pick, pickUpdateDashboardRequest } from "./pick";

describe("pick", () => {
  it("copies listed own keys", () => {
    expect(pick({ a: 1, b: 2, c: 3 }, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("omits listed keys that are absent", () => {
    const object: { a: number; b?: number } = { a: 1 };
    expect(pick(object, ["a", "b"])).toEqual({ a: 1 });
  });

  it("copies keys whose value is undefined", () => {
    expect(pick({ a: undefined, b: 1 }, ["a"])).toEqual({ a: undefined });
  });
});

describe("pickUpdateDashboardRequest", () => {
  it("copies listed dashboard fields and omits id", () => {
    expect(
      pickUpdateDashboardRequest({
        id: 1,
        name: "Sales",
        description: "Q1",
        archived: false,
        collection_id: 2,
        collection_position: 3,
        caveats: "draft",
        position: 4,
        parameters: [],
        auto_apply_filters: true,
        show_in_getting_started: false,
        enable_embedding: false,
        embedding_type: null,
        width: "fixed",
        embedding_params: null,
        cache_ttl: 60,
      }),
    ).toEqual({
      name: "Sales",
      description: "Q1",
      archived: false,
      collection_id: 2,
      collection_position: 3,
      caveats: "draft",
      position: 4,
      parameters: [],
      auto_apply_filters: true,
      show_in_getting_started: false,
      enable_embedding: false,
      embedding_type: null,
      width: "fixed",
      embedding_params: null,
      cache_ttl: 60,
      dashcards: undefined,
      tabs: undefined,
    });
  });

  it("omits listed dashboard fields that are absent", () => {
    expect(pickUpdateDashboardRequest({ id: 1, name: "Sales" })).toEqual({
      name: "Sales",
      dashcards: undefined,
      tabs: undefined,
    });
  });

  it("strips extra dashboard fields from a full dashboard", () => {
    const result = pickUpdateDashboardRequest(createMockDashboard());

    expect(result).toEqual({
      collection_id: null,
      name: "Dashboard",
      description: "",
      cache_ttl: null,
      auto_apply_filters: true,
      archived: false,
      enable_embedding: false,
      embedding_params: null,
      width: "fixed",
      dashcards: [],
      tabs: undefined,
    });
    expect(result).not.toHaveProperty("id");
    expect(result).not.toHaveProperty("entity_id");
    expect(result).not.toHaveProperty("can_write");
    expect(result).not.toHaveProperty("public_uuid");
  });

  it("picks dashcard fields and strips extras", () => {
    const result = pickUpdateDashboardRequest({
      id: 1,
      dashcards: [
        createMockDashboardCard({
          size_x: 4,
          size_y: 3,
          row: 1,
          col: 2,
        }),
      ],
    });

    expect(result.dashcards).toEqual([
      {
        id: 1,
        size_x: 4,
        size_y: 3,
        row: 1,
        col: 2,
        card_id: 1,
        dashboard_tab_id: null,
        parameter_mappings: [],
        visualization_settings: {},
        inline_parameters: null,
        series: undefined,
      },
    ]);
  });

  it("keeps action_id on action dashcards", () => {
    const result = pickUpdateDashboardRequest({
      id: 1,
      dashcards: [createMockActionDashboardCard({ action_id: 7 })],
    });

    expect(result.dashcards?.[0]).toEqual(
      expect.objectContaining({ action_id: 7 }),
    );
  });

  it("reduces series cards to ids", () => {
    const result = pickUpdateDashboardRequest({
      id: 1,
      dashcards: [
        createMockDashboardCard({
          series: [createMockCard({ id: 10, name: "Revenue" })],
        }),
      ],
    });

    expect(result.dashcards?.[0]?.series).toEqual([{ id: 10 }]);
  });

  it("picks tab fields and strips extras", () => {
    const result = pickUpdateDashboardRequest({
      id: 1,
      tabs: [createMockDashboardTab({ name: "Overview", position: 0 })],
    });

    expect(result.tabs).toEqual([{ id: 1, name: "Overview", position: 0 }]);
  });
});
