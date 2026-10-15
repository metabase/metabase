import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import { useDispatch } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Dataset, DatasetQuery, Field, Table } from "metabase-types/api";

import { getColumnRoles } from "../analyses/common-settings";
import type { CommonSettings, UsersTable } from "../analyses/types";
import { buildFilteredQuery, getTableMetadata } from "../base-query";
import { DRILL_MEMBERS_CTE, buildMembersSql } from "../build-sql";
import type { ColumnRoles } from "../columns";
import { nativeCompileRequest } from "../compile-base";
import {
  type AnalysisFilters,
  COLUMN_ROLE_FOR_GRAIN,
  type CohortFilter,
  cohortFilterClause,
} from "../filters";
import { findColumn } from "../find-column";
import type { AnalysisSpec, Grain } from "../spec/types";
import { ident } from "../sql/compile/dialect";
import type { DrillPoint } from "../sql/compose";
import type { CompiledBase } from "../use-analysis-query";

import { getActorTitle } from "./labels";

const STAGE = -1;
/** Prototype: cohorts are snapshotted as ids, so they're capped to keep URLs sane. */
export const MAX_MEMBERS = 5000;
const MAX_TABLE_ROWS = 500;
const MAX_ATTRIBUTE_COLUMNS = 6;

/** Where the actors in a clicked set can be listed, filtered or saved. */
export type DrillTarget = {
  /** Undefined when the table is the event table. */
  usersTable: UsersTable | undefined;
  table: Table;
  /** The column the actor ids are in. */
  column: string;
};

type UseDrillQueriesArgs = {
  spec: AnalysisSpec | undefined;
  compiledBase: CompiledBase | undefined;
  table: Table | undefined;
  usersTable: UsersTable | undefined;
  settings: CommonSettings;
};

export type MembersTable = {
  query: DatasetQuery;
  dataset: Dataset;
  count: number;
};

const runNative = (databaseId: number, sql: string): DatasetQuery => ({
  type: "native",
  database: databaseId,
  native: { query: sql },
});

/** RTK rejects with the response, not an `Error`; the modals show `.message`. */
const rethrowApiError = (error: unknown): never => {
  throw new Error(getErrorMessage(error));
};

const getDatasetError = (dataset: Dataset): string | undefined =>
  dataset.error ? getErrorMessage(dataset.error) : undefined;

/** Low-cardinality text columns worth showing next to each actor. */
const getAttributeFields = (table: Table, columns: ColumnRoles): Field[] => {
  const roleColumns = new Set(Object.values(columns));
  return (table.fields ?? [])
    .filter(
      (field) =>
        field.has_field_values === "list" &&
        field.base_type === "type/Text" &&
        !roleColumns.has(field.name),
    )
    .slice(0, MAX_ATTRIBUTE_COLUMNS);
};

const stripSemicolon = (sql: string): string =>
  sql.trim().replace(/;+\s*$/, "");

const IN_MEMBERS = `IN (SELECT toString(actor) FROM ${DRILL_MEMBERS_CTE})`;

/** Each clicked actor in `eventsSql`, with their activity and latest attributes. */
const buildActorSummarySelect = (
  eventsSql: string,
  grain: Grain,
  columns: ColumnRoles,
  attributes: Field[],
): string => {
  const actor = ident(columns[COLUMN_ROLE_FOR_GRAIN[grain]] ?? "");
  const ts = ident(columns.timestamp ?? "");
  const latest = attributes.map(
    (field) =>
      `  argMaxIf(${ident(field.name)}, ${ts}, ${ident(field.name)} != '') AS ${ident(field.display_name)}`,
  );
  return [
    "SELECT",
    [
      `  ${actor} AS ${ident(getActorTitle(grain))}`,
      `  count() AS ${ident(t`Events`)}`,
      `  min(${ts}) AS ${ident(t`First seen`)}`,
      `  max(${ts}) AS ${ident(t`Last seen`)}`,
      ...latest,
    ].join(",\n"),
    `FROM (${stripSemicolon(eventsSql)}) AS events`,
    `WHERE toString(${actor}) ${IN_MEMBERS}`,
    `GROUP BY ${actor}`,
    `ORDER BY ${ident(t`Last seen`)} DESC`,
    `LIMIT ${MAX_TABLE_ROWS}`,
  ].join("\n");
};

/** The users table's rows for the clicked actors. */
const buildUsersSelect = (usersSql: string, primaryKey: string): string =>
  [
    `SELECT * FROM (${stripSemicolon(usersSql)}) AS users`,
    `WHERE toString(${ident(primaryKey)}) ${IN_MEMBERS}`,
    `LIMIT ${MAX_TABLE_ROWS}`,
  ].join("\n");

/**
 * Queries behind the click actions: who is in a clicked point, and queries
 * on those actors. Everything is `undefined` until the analysis has run.
 */
export const useDrillQueries = ({
  spec,
  compiledBase,
  table,
  usersTable,
  settings,
}: UseDrillQueriesArgs) => {
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);
  const dispatch = useDispatch();
  const columns = useMemo(() => getColumnRoles(settings), [settings]);
  const grain = settings.counting;

  // Each request keeps its own subscription until it settles: ad-hoc results
  // are evicted as soon as nothing subscribes, and a lazy query hook only
  // subscribes to its latest request, so parallel requests lose their data.
  const run = useCallback(
    async (query: DatasetQuery): Promise<Dataset> => {
      const request = dispatch(
        datasetApi.endpoints.getAdhocQuery.initiate(query, {
          forceRefetch: true,
        }),
      );
      try {
        const dataset = await request.unwrap().catch(rethrowApiError);
        const error = getDatasetError(dataset);
        if (error !== undefined) {
          throw new Error(error);
        }
        return dataset;
      } finally {
        request.unsubscribe();
      }
    },
    [dispatch],
  );

  const compileQuery = useCallback(
    async (query: DatasetQuery): Promise<string> => {
      const request = dispatch(
        datasetApi.endpoints.getNativeDataset.initiate(query, {
          forceRefetch: true,
        }),
      );
      try {
        return (await request.unwrap().catch(rethrowApiError)).query;
      } finally {
        request.unsubscribe();
      }
    },
    [dispatch],
  );

  const canDrill = spec !== undefined && compiledBase !== undefined;

  const fetchMemberIds = useCallback(
    async (point: DrillPoint): Promise<string[]> => {
      if (spec === undefined || compiledBase === undefined) {
        throw new Error(t`The analysis hasn't finished running.`);
      }
      const sql = buildMembersSql(
        spec,
        compiledBase.sql,
        compiledBase.columns,
        point,
        `SELECT DISTINCT toString(actor) AS actor FROM ${DRILL_MEMBERS_CTE}\nLIMIT ${MAX_MEMBERS}`,
      );
      if (sql === null) {
        throw new Error(t`This part of the chart can't be traced back yet.`);
      }
      const dataset = await run(runNative(compiledBase.databaseId, sql));
      return dataset.data.rows.map(([id]) => String(id));
    },
    [spec, compiledBase, run],
  );

  /** People drills land on the users table when there is one. */
  const target = useMemo((): DrillTarget | undefined => {
    if (table === undefined) {
      return undefined;
    }
    if (grain === "person" && usersTable !== undefined) {
      return {
        usersTable,
        table: usersTable.table,
        column: usersTable.link.primaryKey,
      };
    }
    const column = columns[COLUMN_ROLE_FOR_GRAIN[grain]];
    return column === null
      ? undefined
      : { usersTable: undefined, table, column };
  }, [table, usersTable, grain, columns]);

  /** A query on the target table, limited to the cohort. */
  const buildCohortQuery = useCallback(
    (cohort: CohortFilter): Lib.Query => {
      if (target === undefined) {
        throw new Error(t`There's no table to look these up in.`);
      }
      const query = Lib.queryFromTableOrCardMetadata(
        metadataProvider,
        getTableMetadata(metadataProvider, target.table.id),
      );
      return Lib.filter(
        query,
        STAGE,
        cohortFilterClause(findColumn(query, target.column), cohort),
      );
    },
    [metadataProvider, target],
  );

  /** A query on the event table, with the analysis's filters and the cohort. */
  const buildCohortEventsQuery = useCallback(
    (cohort: CohortFilter): Lib.Query => {
      if (table === undefined) {
        throw new Error(t`There's no table to look these up in.`);
      }
      const filters: AnalysisFilters = {
        ...settings.filters,
        cohorts: [...settings.filters.cohorts, cohort],
      };
      return buildFilteredQuery(
        metadataProvider,
        getTableMetadata(metadataProvider, table.id),
        { dateRange: settings.date_range, columns, filters },
      );
    },
    [metadataProvider, table, settings, columns],
  );

  /**
   * The clicked actors' table rows, and how many there are. Reads them through
   * the analysis's SQL, so no ids go through MBQL, which is slow with many.
   */
  const fetchMembersTable = useCallback(
    async (point: DrillPoint): Promise<MembersTable> => {
      if (
        spec === undefined ||
        compiledBase === undefined ||
        table === undefined ||
        target === undefined
      ) {
        throw new Error(t`The analysis hasn't finished running.`);
      }
      const sourceQuery =
        target.usersTable !== undefined
          ? Lib.queryFromTableOrCardMetadata(
              metadataProvider,
              getTableMetadata(metadataProvider, target.table.id),
            )
          : buildFilteredQuery(
              metadataProvider,
              getTableMetadata(metadataProvider, table.id),
              {
                dateRange: settings.date_range,
                columns,
                // The members already come from the analysis's cohorts.
                filters: { ...settings.filters, cohorts: [] },
              },
            );
      const sourceSql = await compileQuery(nativeCompileRequest(sourceQuery));
      const select =
        target.usersTable !== undefined
          ? buildUsersSelect(sourceSql, target.column)
          : buildActorSummarySelect(
              sourceSql,
              grain,
              columns,
              getAttributeFields(table, columns),
            );
      const toMembersSql = (outerSelect: string) => {
        const sql = buildMembersSql(
          spec,
          compiledBase.sql,
          compiledBase.columns,
          point,
          outerSelect,
        );
        if (sql === null) {
          throw new Error(t`This part of the chart can't be traced back yet.`);
        }
        return runNative(compiledBase.databaseId, sql);
      };
      const query = toMembersSql(select);
      const [dataset, countDataset] = await Promise.all([
        run(query),
        run(
          toMembersSql(
            `SELECT count(DISTINCT actor) AS members FROM ${DRILL_MEMBERS_CTE}`,
          ),
        ),
      ]);
      const [[count] = []] = countDataset.data.rows;
      return {
        query,
        dataset,
        count: typeof count === "number" ? count : Number(count),
      };
    },
    [
      spec,
      compiledBase,
      table,
      target,
      metadataProvider,
      settings,
      columns,
      grain,
      compileQuery,
      run,
    ],
  );

  return {
    canDrill,
    grain,
    target,
    fetchMemberIds,
    fetchMembersTable,
    buildCohortQuery,
    buildCohortEventsQuery,
  };
};

export type DrillQueries = ReturnType<typeof useDrillQueries>;
