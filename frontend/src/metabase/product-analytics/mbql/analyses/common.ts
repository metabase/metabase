import { type BaseType, type Clause, field } from "../clause";

/** The base event query's last stage, which planners read. */
export const EVENTS_BASE = "events_base";
export const SCOPE_ACTORS = "scope_actors";
export const SCOPED_EVENTS = "scoped_events";

/** A column of a stage, by name and type. */
export type Column = { name: string; baseType: BaseType };

/** A reference to `column`, of the stage's source or of the join `joinAlias`. */
export const col = ({ name, baseType }: Column, joinAlias?: string): Clause =>
  field(name, baseType, joinAlias);
