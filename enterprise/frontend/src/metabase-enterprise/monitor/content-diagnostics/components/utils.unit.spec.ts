import {
  createMockContentDiagnosticsCollection,
  createMockContentDiagnosticsFinding,
} from "metabase-types/api/mocks";

import {
  filterFindingsByName,
  getCollectionPath,
  getEntityIcon,
  getEntityName,
  getEntityTypeLabel,
  getUserName,
} from "./utils";

describe("content-diagnostics utils", () => {
  describe("getEntityIcon", () => {
    it("maps entity types to icons", () => {
      expect(getEntityIcon("card")).toBe("table2");
      expect(getEntityIcon("dashboard")).toBe("dashboard");
    });
  });

  describe("getEntityTypeLabel", () => {
    it("returns human labels", () => {
      expect(getEntityTypeLabel("card")).toBe("Question");
      expect(getEntityTypeLabel("dashboard")).toBe("Dashboard");
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

  describe("filterFindingsByName", () => {
    const findings = [
      createMockContentDiagnosticsFinding({
        id: 1,
        entity_display_name: "Sales overview",
      }),
      createMockContentDiagnosticsFinding({
        id: 2,
        entity_display_name: "Marketing funnel",
      }),
    ];

    it("returns all findings when query is empty", () => {
      expect(filterFindingsByName(findings, undefined)).toEqual(findings);
      expect(filterFindingsByName(findings, "   ")).toEqual(findings);
    });

    it("filters by display name case-insensitively", () => {
      const result = filterFindingsByName(findings, "sales");
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(1);
    });
  });
});
