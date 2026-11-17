import { useCallback } from "react";
import _ from "underscore";

import { usePrototypeStorage } from "metabase/metadata/prototype-storage";
import type { DatabaseId, SchemaName } from "metabase-types/api";
import { isObject } from "metabase-types/guards";

import { DEFAULT_REQUIRED_FILTER_ROW_THRESHOLD } from "./inference";

/** What an admin set for a database or schema; absent means inherit */
export type SegmentSettingsOverrides = {
  /** Off: sync generates no system segments and proposes no cohorts */
  generateSegments?: boolean;
  /** Tables with at least this many rows get a proposed required filter */
  requiredFilterRowThreshold?: number;
};

/** Where a resolved setting came from: a schema wins over its database */
export type SegmentSettingSource = "instance" | "database" | "schema";

export type ResolvedSegmentSetting<T> = {
  value: T;
  source: SegmentSettingSource;
};

export type ResolvedSegmentSettings = {
  generateSegments: ResolvedSegmentSetting<boolean>;
  requiredFilterRowThreshold: ResolvedSegmentSetting<number>;
};

type SegmentSettingsState = {
  databases: Record<string, SegmentSettingsOverrides>;
  schemas: Record<string, SegmentSettingsOverrides>;
};

// PROTOTYPE: mocked. The spec doesn't name where these live yet (database
// settings or a layer column), so they're kept in localStorage.
const STORAGE_KEY = "metabase-prototype-segment-settings";

const INSTANCE_DEFAULTS: Required<SegmentSettingsOverrides> = {
  generateSegments: true,
  requiredFilterRowThreshold: DEFAULT_REQUIRED_FILTER_ROW_THRESHOLD,
};

function parseOverrides(value: unknown): SegmentSettingsOverrides {
  if (!isObject(value)) {
    return {};
  }
  return {
    generateSegments:
      typeof value.generateSegments === "boolean"
        ? value.generateSegments
        : undefined,
    requiredFilterRowThreshold:
      typeof value.requiredFilterRowThreshold === "number" &&
      value.requiredFilterRowThreshold > 0
        ? value.requiredFilterRowThreshold
        : undefined,
  };
}

function parseState(value: unknown): SegmentSettingsState {
  if (!isObject(value)) {
    return { databases: {}, schemas: {} };
  }
  return {
    databases: isObject(value.databases)
      ? _.mapObject(value.databases, parseOverrides)
      : {},
    schemas: isObject(value.schemas)
      ? _.mapObject(value.schemas, parseOverrides)
      : {},
  };
}

const getSchemaKey = (databaseId: DatabaseId, schemaName: SchemaName) =>
  `${databaseId}:${schemaName}`;

/** Merges a change; `undefined` values drop the override so it inherits */
function applyChange(
  current: SegmentSettingsOverrides | undefined,
  change: SegmentSettingsOverrides,
): SegmentSettingsOverrides {
  return _.omit({ ...current, ...change }, (value) => value === undefined);
}

function resolveSetting<T>(
  instanceValue: T,
  databaseValue: T | undefined,
  schemaValue: T | undefined,
): ResolvedSegmentSetting<T> {
  if (schemaValue !== undefined) {
    return { value: schemaValue, source: "schema" };
  }
  if (databaseValue !== undefined) {
    return { value: databaseValue, source: "database" };
  }
  return { value: instanceValue, source: "instance" };
}

/**
 * Segment generation and the required-filter row threshold, per database
 * and per schema. A schema's setting wins over its database's, which wins
 * over the instance default.
 */
export function useSegmentSettings() {
  const [state, updateState] = usePrototypeStorage(STORAGE_KEY, parseState);

  const getDatabaseSegmentSettings = useCallback(
    (databaseId: DatabaseId): SegmentSettingsOverrides =>
      state.databases[String(databaseId)] ?? {},
    [state],
  );

  const getSchemaSegmentSettings = useCallback(
    (
      databaseId: DatabaseId,
      schemaName: SchemaName,
    ): SegmentSettingsOverrides =>
      state.schemas[getSchemaKey(databaseId, schemaName)] ?? {},
    [state],
  );

  /** Pass a schema for a table's settings, or leave it out for a database's */
  const getSegmentSettings = useCallback(
    (
      databaseId: DatabaseId,
      schemaName?: SchemaName,
    ): ResolvedSegmentSettings => {
      const database = state.databases[String(databaseId)];
      const schema =
        schemaName != null
          ? state.schemas[getSchemaKey(databaseId, schemaName)]
          : undefined;
      return {
        generateSegments: resolveSetting(
          INSTANCE_DEFAULTS.generateSegments,
          database?.generateSegments,
          schema?.generateSegments,
        ),
        requiredFilterRowThreshold: resolveSetting(
          INSTANCE_DEFAULTS.requiredFilterRowThreshold,
          database?.requiredFilterRowThreshold,
          schema?.requiredFilterRowThreshold,
        ),
      };
    },
    [state],
  );

  const setDatabaseSegmentSettings = useCallback(
    (databaseId: DatabaseId, change: SegmentSettingsOverrides) =>
      updateState((current) => ({
        ...current,
        databases: {
          ...current.databases,
          [String(databaseId)]: applyChange(
            current.databases[String(databaseId)],
            change,
          ),
        },
      })),
    [updateState],
  );

  const setSchemaSegmentSettings = useCallback(
    (
      databaseId: DatabaseId,
      schemaName: SchemaName,
      change: SegmentSettingsOverrides,
    ) => {
      const schemaKey = getSchemaKey(databaseId, schemaName);
      updateState((current) => ({
        ...current,
        schemas: {
          ...current.schemas,
          [schemaKey]: applyChange(current.schemas[schemaKey], change),
        },
      }));
    },
    [updateState],
  );

  return {
    getSegmentSettings,
    getDatabaseSegmentSettings,
    getSchemaSegmentSettings,
    setDatabaseSegmentSettings,
    setSchemaSegmentSettings,
  };
}
