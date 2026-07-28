import type { ContentDiagnosticsFinding } from "metabase-types/api";
import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsFinding,
} from "metabase-types/api/mocks";

import {
  getCollectionPath,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getEntityTypesParam,
  getEntityUrl,
  getEntityViewLabel,
  getFilterTypeLabel,
  getParamsWithoutDefaults,
  getSortOptions,
  getUserName,
} from "./utils";

describe("getSortOptions", () => {
  it("returns undefined when either sort field is missing", () => {
    expect(getSortOptions({})).toBeUndefined();
    expect(getSortOptions({ sortColumn: "name" })).toBeUndefined();
    expect(getSortOptions({ sortDirection: "asc" })).toBeUndefined();
  });

  it("maps params to a { column, direction } sorting", () => {
    expect(
      getSortOptions({ sortColumn: "last-active-at", sortDirection: "desc" }),
    ).toEqual({ column: "last-active-at", direction: "desc" });
  });
});

describe("content-diagnostics utils", () => {
  const finding = (opts: Partial<ContentDiagnosticsFinding>) =>
    createMockContentDiagnosticsFinding(opts);

  describe("getEntityIcon", () => {
    it("maps entity and card types to icons", () => {
      expect(
        getEntityIcon(finding({ entity_type: "card", card_type: "question" })),
      ).toBe("table2");
      expect(
        getEntityIcon(finding({ entity_type: "card", card_type: "model" })),
      ).toBe("model");
      expect(
        getEntityIcon(finding({ entity_type: "card", card_type: "metric" })),
      ).toBe("metric");
      expect(getEntityIcon(finding({ entity_type: "dashboard" }))).toBe(
        "dashboard",
      );
      expect(getEntityIcon(finding({ entity_type: "document" }))).toBe(
        "document",
      );
      expect(getEntityIcon(finding({ entity_type: "transform" }))).toBe(
        "transform",
      );
    });

    it("falls back to the card icon when card_type is absent", () => {
      expect(
        getEntityIcon(finding({ entity_type: "card", card_type: null })),
      ).toBe("table2");
    });
  });

  describe("getEntityTypeLabel", () => {
    it("distinguishes card subtypes and labels other types", () => {
      expect(
        getEntityTypeLabel(
          finding({ entity_type: "card", card_type: "question" }),
        ),
      ).toBe("Question");
      expect(
        getEntityTypeLabel(
          finding({ entity_type: "card", card_type: "model" }),
        ),
      ).toBe("Model");
      expect(
        getEntityTypeLabel(
          finding({ entity_type: "card", card_type: "metric" }),
        ),
      ).toBe("Metric");
      expect(getEntityTypeLabel(finding({ entity_type: "dashboard" }))).toBe(
        "Dashboard",
      );
      expect(getEntityTypeLabel(finding({ entity_type: "document" }))).toBe(
        "Document",
      );
      expect(getEntityTypeLabel(finding({ entity_type: "transform" }))).toBe(
        "Transform",
      );
    });

    it("falls back to Question when card_type is absent", () => {
      expect(
        getEntityTypeLabel(finding({ entity_type: "card", card_type: null })),
      ).toBe("Question");
    });
  });

  describe("getEntityViewLabel", () => {
    it("returns full translated labels per entity and card type", () => {
      expect(
        getEntityViewLabel(
          finding({ entity_type: "card", card_type: "question" }),
        ),
      ).toBe("View this question");
      expect(
        getEntityViewLabel(
          finding({ entity_type: "card", card_type: "model" }),
        ),
      ).toBe("View this model");
      expect(
        getEntityViewLabel(
          finding({ entity_type: "card", card_type: "metric" }),
        ),
      ).toBe("View this metric");
      expect(getEntityViewLabel(finding({ entity_type: "dashboard" }))).toBe(
        "View this dashboard",
      );
      expect(getEntityViewLabel(finding({ entity_type: "document" }))).toBe(
        "View this document",
      );
      expect(getEntityViewLabel(finding({ entity_type: "transform" }))).toBe(
        "View this transform",
      );
    });
  });

  describe("getEntityUrl", () => {
    it("links cards to the correct route per card type", () => {
      expect(
        getEntityUrl(
          finding({
            entity_type: "card",
            card_type: "question",
            entity_id: 10,
          }),
        ),
      ).toContain("/question/10");
      expect(
        getEntityUrl(
          finding({ entity_type: "card", card_type: "model", entity_id: 11 }),
        ),
      ).toContain("/model/11");
      expect(
        getEntityUrl(
          finding({ entity_type: "card", card_type: "metric", entity_id: 12 }),
        ),
      ).toContain("/metric/12");
    });

    it("links a card with no card_type to /question/", () => {
      expect(
        getEntityUrl(
          finding({ entity_type: "card", card_type: null, entity_id: 13 }),
        ),
      ).toContain("/question/13");
    });
  });

  describe("getFilterTypeLabel", () => {
    it("returns plural human labels", () => {
      expect(getFilterTypeLabel("card")).toBe("Questions");
      expect(getFilterTypeLabel("dashboard")).toBe("Dashboards");
      expect(getFilterTypeLabel("document")).toBe("Documents");
      expect(getFilterTypeLabel("transform")).toBe("Transforms");
    });
  });

  describe("getEntityTypesParam", () => {
    it("omits the param when every type is selected", () => {
      expect(
        getEntityTypesParam(["card", "dashboard", "document", "transform"]),
      ).toBeUndefined();
    });

    it("returns the selection when it is a strict subset", () => {
      expect(getEntityTypesParam(["card"])).toEqual(["card"]);
    });
  });

  describe("getParamsWithoutDefaults", () => {
    it("strips default params", () => {
      expect(
        getParamsWithoutDefaults({
          page: 0,
          entityTypes: ["card", "dashboard", "document", "transform"],
          includePersonalCollections: true,
        }),
      ).toEqual({
        page: undefined,
        entityTypes: undefined,
        includePersonalCollections: undefined,
      });
    });

    it("preserves non-default params", () => {
      expect(
        getParamsWithoutDefaults({
          page: 1,
          query: "sales",
          entityTypes: ["card"],
          includePersonalCollections: false,
          sortColumn: "name",
          sortDirection: "asc",
        }),
      ).toEqual({
        page: 1,
        query: "sales",
        entityTypes: ["card"],
        includePersonalCollections: false,
        sortColumn: "name",
        sortDirection: "asc",
      });
    });
  });

  describe("getEntityName", () => {
    it("returns the display name", () => {
      const finding = createMockContentDiagnosticsFinding({
        entity_display_name: "My question",
      });
      expect(getEntityName(finding)).toBe("My question");
    });

    it("falls back to Untitled when name is null", () => {
      const finding = createMockContentDiagnosticsFinding({
        entity_display_name: null,
      });
      expect(getEntityName(finding)).toBe("Untitled");
    });
  });

  describe("getCollectionPath", () => {
    it("returns Our analytics when there is no collection", () => {
      expect(getCollectionPath(null)).toBe("Our analytics");
    });

    it("joins ancestors and the collection name", () => {
      const collection = createMockContentDiagnosticsCollection({
        name: "Reports",
        effective_ancestors: [
          { id: 1, name: "Root" },
          { id: 2, name: "Team" },
        ],
      });
      expect(getCollectionPath(collection)).toBe("Root / Team / Reports");
    });
  });

  describe("getUserName", () => {
    it("returns a dash when there is no user", () => {
      expect(getUserName(null)).toBe("—");
    });

    it("returns the name for an account user", () => {
      expect(
        getUserName({ type: "user", id: 1, name: "Jane", email: "j@x.test" }),
      ).toBe("Jane");
    });

    it("falls back to email when name is missing", () => {
      expect(
        getUserName({ type: "user", id: 1, name: null, email: "j@x.test" }),
      ).toBe("j@x.test");
    });

    it("returns the email for an external owner", () => {
      expect(getUserName({ type: "external", email: "ext@x.test" })).toBe(
        "ext@x.test",
      );
    });
  });
});
