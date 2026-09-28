import type { TableSchema } from "../data-schema";

import type {
  DefinedQuery,
  MetabaseQueryOptions,
  RequireAggregationsForBreakouts,
} from "./types";

type SavedQuestionBinding = {
  savedQuestionSourceId?: number;
};

/**
 * Defines a source-controlled data app query that can be synchronized to a
 * saved question.
 */
export function defineQuery<
  TEntity extends TableSchema | undefined = undefined,
  TSchema = unknown,
  const TQuery = MetabaseQueryOptions<TEntity, TSchema>,
>(
  query: TQuery &
    (TQuery extends SavedQuestionBinding ? unknown : SavedQuestionBinding) &
    (TQuery extends MetabaseQueryOptions<TEntity, TSchema>
      ? TQuery extends { source: unknown }
        ? RequireAggregationsForBreakouts<TQuery>
        : unknown
      : MetabaseQueryOptions<TEntity, TSchema>),
): TQuery & DefinedQuery {
  // `DefinedQuery` has no runtime member, so the object is returned as is; the
  // cast only adds the mark that the query hooks require.
  return query as TQuery & DefinedQuery;
}
