import type { TableSchema } from "../data-schema";

import type {
  DefinedQuery,
  MetabaseQueryOptions,
  RequireAggregationsForBreakouts,
  RequireGroupedOrderByNames,
} from "./types";

/**
 * Defines a data app query: a question over a table of the app's schema, which
 * the dev preview runs from its definition. A production build runs the
 * question its `entityId` names.
 */
export function defineQuery<
  TEntity extends TableSchema | undefined = undefined,
  TSchema = unknown,
  const TQuery = MetabaseQueryOptions<TEntity, TSchema>,
>(
  query: TQuery &
    (TQuery extends MetabaseQueryOptions<TEntity, TSchema>
      ? TQuery extends { source: unknown }
        ? RequireAggregationsForBreakouts<TQuery> &
            RequireGroupedOrderByNames<TQuery>
        : unknown
      : MetabaseQueryOptions<TEntity, TSchema>),
): TQuery & DefinedQuery {
  // `DefinedQuery` has no runtime member, so the object is returned as is; the
  // cast only adds the mark that the query hooks require.
  return query as TQuery & DefinedQuery;
}
