import type { EngineField, FieldGroupConfig } from "metabase-types/api";

import { GroupedFields, groupFields } from "./field-grouping";

describe("groupFields", () => {
  const hostField: EngineField = {
    name: "host",
    type: "string",
    "group-id": "host-port",
  };

  const portField: EngineField = {
    name: "port",
    type: "integer",
    "group-id": "host-port",
  };

  const databaseField: EngineField = {
    name: "database",
    type: "string",
  };

  const fieldGroupConfig: FieldGroupConfig = {
    id: "host-port",
    "container-style": "flex",
  };

  it("should return the same fields if the array is empty", () => {
    const result = groupFields({
      fields: [],
      fieldGroupConfig,
    });

    expect(result).toEqual([]);
  });

  it("should return the same fields if no fields match the group-id", () => {
    const fields = [databaseField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toEqual(fields);
  });

  it("should group fields that match the group-id", () => {
    const fields = [hostField, portField, databaseField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(GroupedFields);
    expect((result[0] as GroupedFields).fields).toEqual([hostField, portField]);
    expect((result[0] as GroupedFields).fieldGroupConfig).toEqual(
      fieldGroupConfig,
    );
    expect(result[1]).toEqual(databaseField);
  });

  it("should insert grouped field at the position of the first matching field", () => {
    const fields = [databaseField, hostField, portField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(databaseField);
    expect(result[1]).toBeInstanceOf(GroupedFields);
    expect((result[1] as GroupedFields).fields).toEqual([hostField, portField]);
  });

  it("should skip fields that are already grouped", () => {
    const existingGroup = new GroupedFields([hostField], fieldGroupConfig);
    const fields = [existingGroup, portField, databaseField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toBe(existingGroup);
    expect(result[1]).toBeInstanceOf(GroupedFields);
    expect((result[1] as GroupedFields).fields).toEqual([portField]);
    expect(result[2]).toEqual(databaseField);
  });

  it("should handle all fields matching the group-id", () => {
    const fields = [hostField, portField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toBeInstanceOf(GroupedFields);
    expect((result[0] as GroupedFields).fields).toEqual([hostField, portField]);
  });

  it("should preserve order of non-grouped fields", () => {
    const usernameField: EngineField = { name: "username", type: "string" };
    const passwordField: EngineField = { name: "password", type: "password" };
    const fields = [usernameField, hostField, portField, passwordField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(usernameField);
    expect(result[1]).toBeInstanceOf(GroupedFields);
    expect(result[2]).toEqual(passwordField);
  });

  it("should handle non-contiguous fields with matching group-id", () => {
    const usernameField: EngineField = { name: "username", type: "string" };
    const fields = [hostField, usernameField, portField];

    const result = groupFields({
      fields,
      fieldGroupConfig,
    });

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(GroupedFields);
    expect((result[0] as GroupedFields).fields).toEqual([hostField, portField]);
    expect(result[1]).toEqual(usernameField);
  });
});
