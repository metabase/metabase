import { createMockColumn } from "metabase-types/api/mocks";

import { substituteColumnsInTemplate } from "./utils";

// Minimal settings mock: column() returns an empty object (no special formatting)
const plainSettings = {
  column: () => ({}),
} as any;

describe("substituteColumnsInTemplate", () => {
  const cols = [
    createMockColumn({ name: "user_name", display_name: "User Name" }),
    createMockColumn({ name: "total", display_name: "Total" }),
    createMockColumn({ name: "created_at", display_name: "Created At" }),
  ];

  describe("token matching", () => {
    it("should replace a token that matches a column display_name", () => {
      const result = substituteColumnsInTemplate(
        "Hello, {{User Name}}!",
        cols,
        ["Alice", 42, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("Hello, Alice!");
    });

    it("should fall back to raw column name when display_name does not match", () => {
      const result = substituteColumnsInTemplate(
        "Total: {{total}}",
        cols,
        ["Alice", 42, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("Total: 42");
    });

    it("should leave unresolved tokens intact when no column matches", () => {
      const result = substituteColumnsInTemplate(
        "Unknown: {{nonexistent}}",
        cols,
        ["Alice", 42, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("Unknown: {{nonexistent}}");
    });

    it("should match tokens case-insensitively against display_name", () => {
      const result = substituteColumnsInTemplate(
        "{{user name}} and {{TOTAL}}",
        cols,
        ["Bob", 99, "2024-06-01"],
        plainSettings,
      );
      expect(result).toBe("Bob and 99");
    });

    it("should match tokens case-insensitively against raw name", () => {
      const result = substituteColumnsInTemplate(
        "{{CREATED_AT}}",
        cols,
        ["Alice", 42, "2024-03-15"],
        plainSettings,
      );
      expect(result).toBe("2024-03-15");
    });

    it("should trim whitespace inside token braces", () => {
      const result = substituteColumnsInTemplate(
        "{{ Total }}",
        cols,
        ["Alice", 7, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("7");
    });
  });

  describe("multiple tokens", () => {
    it("should replace multiple tokens in a single template", () => {
      const result = substituteColumnsInTemplate(
        "**{{User Name}}** spent {{Total}} on {{Created At}}",
        cols,
        ["Charlie", 150, "2024-07-04"],
        plainSettings,
      );
      expect(result).toBe("**Charlie** spent 150 on 2024-07-04");
    });

    it("should handle repeated use of the same token", () => {
      const result = substituteColumnsInTemplate(
        "{{Total}} total ({{Total}} again)",
        cols,
        ["Alice", 5, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("5 total (5 again)");
    });
  });

  describe("edge cases", () => {
    it("should return the template unchanged when there are no tokens", () => {
      const template = "No tokens here.";
      const result = substituteColumnsInTemplate(
        template,
        cols,
        ["Alice", 42, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe(template);
    });

    it("should return an empty string for an empty template", () => {
      const result = substituteColumnsInTemplate(
        "",
        cols,
        ["Alice", 42, "2024-01-01"],
        plainSettings,
      );
      expect(result).toBe("");
    });

    it("should handle null/undefined row values gracefully", () => {
      const result = substituteColumnsInTemplate(
        "Value: {{Total}}",
        cols,
        ["Alice", null, "2024-01-01"],
        plainSettings,
      );
      // null formatted → empty string
      expect(result).toBe("Value: ");
    });

    it("should work with an empty column list (all tokens unresolved)", () => {
      const result = substituteColumnsInTemplate(
        "{{foo}} {{bar}}",
        [],
        [],
        plainSettings,
      );
      expect(result).toBe("{{foo}} {{bar}}");
    });
  });

  describe("display_name takes priority over raw name", () => {
    it("should prefer display_name match when both display_name and name could match different columns", () => {
      // col A: name="total", display_name="Grand Total"
      // col B: name="grand_total", display_name="Total"
      // Token "Total" should match col B (display_name match) not col A (name match)
      const mixedCols = [
        createMockColumn({ name: "total", display_name: "Grand Total" }),
        createMockColumn({ name: "grand_total", display_name: "Total" }),
      ];
      const result = substituteColumnsInTemplate(
        "{{Total}}",
        mixedCols,
        [100, 200],
        plainSettings,
      );
      // Should use col B's value (index 1 = 200) because display_name="Total" matches first
      expect(result).toBe("200");
    });
  });
});
