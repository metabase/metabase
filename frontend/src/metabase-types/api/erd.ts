import type {
  GetApiEeErdData,
  MetabaseEnterpriseErdImplErdEdge,
  MetabaseEnterpriseErdImplErdField,
  MetabaseEnterpriseErdImplErdNode,
  MetabaseEnterpriseErdImplErdOwner,
} from "metabase-types/openapi";

import type { ConcreteTableId, DatabaseId, FieldId, SchemaName } from "./";

// Aliases over the generated OpenAPI types — the backend response schema
// (metabase-enterprise.erd.impl) fully describes the wire format. The only
// hand-written layer re-applies semantic id aliases (plain `number`/`string`
// on the wire): the ERD endpoint never traverses cards / saved-question
// virtual tables, hence ConcreteTableId rather than TableId.
//
// The `_Matches*` assertions below guarantee the overrides stay structurally
// identical to the generated types — if a backend schema change drifts an
// overridden field (e.g. an id becomes a string), this file fails to compile
// instead of the override silently masking the change.

export type ErdOwner = MetabaseEnterpriseErdImplErdOwner;

export type ErdField = Omit<
  MetabaseEnterpriseErdImplErdField,
  "id" | "fk_target_field_id" | "fk_target_table_id"
> & {
  id: FieldId;
  fk_target_field_id: FieldId | null;
  fk_target_table_id: ConcreteTableId | null;
};

export type ErdNode = Omit<
  MetabaseEnterpriseErdImplErdNode,
  "table_id" | "db_id" | "schema" | "fields"
> & {
  table_id: ConcreteTableId;
  db_id: DatabaseId;
  schema: SchemaName | null;
  fields: ErdField[];
};

export type ErdEdge = Omit<
  MetabaseEnterpriseErdImplErdEdge,
  "source_table_id" | "source_field_id" | "target_table_id" | "target_field_id"
> & {
  source_table_id: ConcreteTableId;
  source_field_id: FieldId;
  target_table_id: ConcreteTableId;
  target_field_id: FieldId;
};

export type ErdResponse = {
  nodes: ErdNode[];
  edges: ErdEdge[];
};

export type ErdRelationship = ErdEdge["relationship"];

/**
 * Backend semantics:
 *  - With a `schema`, the backend returns all tables in that schema; we only
 *    append `table-ids` for external tables the user has explicitly expanded
 *    into.
 *  - With no `schema` but explicit `table-ids`, those are the focal set.
 *  - At least one of `schema` or `table-ids` must be provided.
 */
export type ErdParams = Omit<GetApiEeErdData["query"], "table-ids"> & {
  "database-id": DatabaseId;
  "table-ids"?: ConcreteTableId[] | null;
  schema?: SchemaName | null;
};

type MutuallyAssignable<A, B> = [A] extends [B]
  ? [B] extends [A]
    ? true
    : false
  : false;

// `Expect<false>` violates the generic constraint, turning drift into a
// compile error on the offending line.
type Expect<_T extends true> = never;

type _MatchesErdField = Expect<
  MutuallyAssignable<ErdField, MetabaseEnterpriseErdImplErdField>
>;
type _MatchesErdNode = Expect<
  MutuallyAssignable<ErdNode, MetabaseEnterpriseErdImplErdNode>
>;
type _MatchesErdEdge = Expect<
  MutuallyAssignable<ErdEdge, MetabaseEnterpriseErdImplErdEdge>
>;
type _MatchesErdParams = Expect<
  MutuallyAssignable<ErdParams, GetApiEeErdData["query"]>
>;
