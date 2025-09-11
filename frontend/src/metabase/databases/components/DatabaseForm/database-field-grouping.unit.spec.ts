import type { EngineField } from "metabase-types/api";
import { createMockEngineField } from "metabase-types/api/mocks";

import {
  FieldRegexRule,
  GroupField,
  VisibleIfRule,
  groupFieldsByRules,
} from "./database-field-grouping";

describe("database-field-grouping", () => {
  describe("groupFieldsByRules", () => {
    const hostField = createMockEngineField({ name: "host" });
    const portField = createMockEngineField({ name: "port" });
    const userField = createMockEngineField({ name: "user" });
    const passwordField = createMockEngineField({ name: "password" });

    it("returns original fields when no rules are provided", () => {
      const fields = [hostField, portField, userField];

      const result = groupFieldsByRules(fields, {
        className: "test-class",
        key: "test-key",
      });

      expect(result).toEqual(fields);
    });

    it("returns original fields when no rules match", () => {
      const fields = [userField, passwordField];

      const result = groupFieldsByRules(fields, {
        rules: [new FieldRegexRule(/^(host|port)$/)],
        className: "test-class",
        key: "test-key",
      });

      expect(result).toEqual(fields);
    });

    it("groups fields matching FieldRegexRule", () => {
      const fields = [userField, hostField, portField, passwordField];

      const result = groupFieldsByRules(fields, {
        rules: [new FieldRegexRule(/^(host|port)$/)],
        className: "host-port-group",
        key: "host-port",
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(userField);
      expect(result[1]).toBeInstanceOf(GroupField);
      expect(result[2]).toBe(passwordField);

      const groupField = result[1] as GroupField;
      expect(groupField.fields).toEqual([hostField, portField]);
      expect(groupField.className).toBe("host-port-group");
      expect(groupField.key).toBe("host-port");
    });

    it("groups fields matching VisibleIfRule", () => {
      const sslField = createMockEngineField({
        name: "ssl",
        "visible-if": { advanced: true },
      });
      const advancedField = createMockEngineField({
        name: "advanced-option",
        "visible-if": { advanced: true },
      });
      const basicField = createMockEngineField({
        name: "basic",
        "visible-if": { advanced: false },
      });

      const fields = [basicField, sslField, advancedField];

      const result = groupFieldsByRules(fields, {
        rules: [new VisibleIfRule({ advanced: true })],
        className: "advanced-group",
        key: "advanced",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(basicField);
      expect(result[1]).toBeInstanceOf(GroupField);

      const groupField = result[1] as GroupField;
      expect(groupField.fields).toEqual([sslField, advancedField]);
      expect(groupField.className).toBe("advanced-group");
      expect(groupField.key).toBe("advanced");
    });

    it("handles multiple rules with OR logic", () => {
      const sslField = createMockEngineField({
        name: "ssl",
        "visible-if": { advanced: true },
      });
      const hostField = createMockEngineField({ name: "host" });
      const portField = createMockEngineField({ name: "port" });

      const fields = [sslField, hostField, portField, userField];

      const result = groupFieldsByRules(fields, {
        rules: [
          new VisibleIfRule({ advanced: true }),
          new FieldRegexRule(/^(host|port)$/),
        ],
        className: "mixed-group",
        key: "mixed",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBeInstanceOf(GroupField);
      expect(result[1]).toBe(userField);

      const groupField = result[0] as GroupField;
      expect(groupField.fields).toEqual([sslField, hostField, portField]);
    });

    it("preserves position of first matching field when grouping", () => {
      const fields = [userField, hostField, passwordField, portField];

      const result = groupFieldsByRules(fields, {
        rules: [new FieldRegexRule(/^(host|port)$/)],
        className: "host-port-group",
        key: "host-port",
      });

      expect(result).toHaveLength(3);
      expect(result[0]).toBe(userField);
      expect(result[1]).toBeInstanceOf(GroupField); // Group inserted at position of first match (host)
      expect(result[2]).toBe(passwordField);
    });

    it("handles VisibleIfRule with missing visible-if property", () => {
      const fieldWithoutVisibleIf = createMockEngineField({ name: "basic" });
      const fieldWithVisibleIf = createMockEngineField({
        name: "advanced",
        "visible-if": { ssl: true },
      });

      const fields = [fieldWithoutVisibleIf, fieldWithVisibleIf];

      const result = groupFieldsByRules(fields, {
        rules: [new VisibleIfRule({ ssl: true })],
        className: "ssl-group",
        key: "ssl",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(fieldWithoutVisibleIf);
      expect(result[1]).toBeInstanceOf(GroupField);

      const groupField = result[1] as GroupField;
      expect(groupField.fields).toEqual([fieldWithVisibleIf]);
    });

    it("handles VisibleIfRule with partial match", () => {
      const field = createMockEngineField({
        name: "test",
        "visible-if": { ssl: true, advanced: false },
      });

      const fields = [field];

      const result = groupFieldsByRules(fields, {
        rules: [new VisibleIfRule({ ssl: true, advanced: true })], // Different advanced value
        className: "test-group",
        key: "test",
      });

      expect(result).toEqual([field]); // Should not group because advanced values don't match
    });

    it("skips already grouped fields", () => {
      const existingGroupField = new GroupField(
        [createMockEngineField({ name: "existing" })],
        "existing-class",
        "existing-key",
      );

      const fields: Array<EngineField | GroupField> = [
        existingGroupField,
        hostField,
        portField,
      ];

      const result = groupFieldsByRules(fields, {
        rules: [new FieldRegexRule(/^(host|port)$/)],
        className: "host-port-group",
        key: "host-port",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toBe(existingGroupField);
      expect(result[1]).toBeInstanceOf(GroupField);

      const newGroupField = result[1] as GroupField;
      expect(newGroupField.fields).toEqual([hostField, portField]);
    });

    it("handles empty rules array", () => {
      const fields = [hostField, portField];

      const result = groupFieldsByRules(fields, {
        rules: [],
        className: "test-class",
        key: "test-key",
      });

      expect(result).toEqual(fields);
    });
  });
});
