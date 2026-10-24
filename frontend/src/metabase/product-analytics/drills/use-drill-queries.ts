import { useCallback, useMemo } from "react";
import { t } from "ttag";

import { datasetApi } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { useMetadataProvider } from "metabase/metadata-store";
import { useDispatch } from "metabase/redux";
import * as Lib from "metabase-lib";
import type { Dataset, DatasetQuery, Table } from "metabase-types/api";

import { getColumnRoles } from "../analyses/common-settings";
import type { CommonSettings, UsersTable } from "../analyses/types";
import { buildFilteredQuery, getTableMetadata } from "../base-query";
import { DRILL_MEMBERS_CTE, buildMembersSql } from "../build-sql";
import {
  type AnalysisFilters,
  COLUMN_ROLE_FOR_GRAIN,
  type CohortFilter,
  cohortFilterClause,
} from "../filters";
import { findColumn } from "../find-column";
import type { AnalysisSpec } from "../spec/types";
import type { DrillPoint } from "../sql/compose";
import type { CompiledBase } from "../use-analysis-query";

const STAGE = -1;
/** Prototype: cohorts are snapshotted as ids, so they're capped to keep URLs sane. */
export const MAX_MEMBERS = 5000;

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
   * The clicked actors as a question to explore: the users table's rows for
   * them, or, without one, a row per actor from the events in the analysis,
   * with how many they have and their first and last.
   */
  const buildMembersQuery = useCallback(
    (cohort: CohortFilter): Lib.Query => {
      if (target === undefined) {
        throw new Error(t`There's no table to look these up in.`);
      }
      if (target.usersTable !== undefined) {
        return buildCohortQuery(cohort);
      }
      const events = buildCohortEventsQuery(cohort);
      const query = Lib.aggregateByCount(
        Lib.breakout(events, STAGE, findColumn(events, target.column)),
        STAGE,
      );
      const timestamp = columns.timestamp;
      if (timestamp === null) {
        return query;
      }
      return ["min", "max"].reduce((withFirstAndLast, operatorName) => {
        const operator = Lib.availableAggregationOperators(
          withFirstAndLast,
          STAGE,
        ).find(
          (item) =>
            Lib.displayInfo(withFirstAndLast, STAGE, item).shortName ===
            operatorName,
        );
        const column = operator
          ? Lib.aggregationOperatorColumns(operator).find(
              (item) =>
                Lib.displayInfo(withFirstAndLast, STAGE, item).name ===
                timestamp,
            )
          : undefined;
        return operator && column
          ? Lib.aggregate(
              withFirstAndLast,
              STAGE,
              Lib.aggregationClause(operator, column),
            )
          : withFirstAndLast;
      }, query);
    },
    [target, buildCohortQuery, buildCohortEventsQuery, columns],
  );

  return {
    canDrill,
    grain,
    target,
    fetchMemberIds,
    buildMembersQuery,
    buildCohortQuery,
    buildCohortEventsQuery,
  };
};

export type DrillQueries = ReturnType<typeof useDrillQueries>;
