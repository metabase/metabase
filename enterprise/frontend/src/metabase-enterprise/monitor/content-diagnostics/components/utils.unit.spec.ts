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
  getFilterTypeLabel,
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
  describe("getEntityIcon", () => {
    it("maps entity types to icons", () => {
      expect(getEntityIcon("card")).toBe("table2");
      expect(getEntityIcon("dashboard")).toBe("dashboard");
      expect(getEntityIcon("document")).toBe("document");
      expect(getEntityIcon("transform")).toBe("transform");
    });
  });

  describe("getEntityTypeLabel", () => {
    it("returns human labels", () => {
      expect(getEntityTypeLabel("card")).toBe("Question");
      expect(getEntityTypeLabel("dashboard")).toBe("Dashboard");
      expect(getEntityTypeLabel("document")).toBe("Document");
      expect(getEntityTypeLabel("transform")).toBe("Transform");
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
