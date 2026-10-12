import type * as Lib from "metabase-lib";

import type { ColumnRoles } from "../columns";

/** A setting's pointer to an event. Later variants: inline filters, saved definitions from the API. */
export type EventRef = { type: "saved"; id: string };

export type EventDefinition = {
  id: string;
  name: string;
  getFilter: (query: Lib.Query, columns: ColumnRoles) => Lib.ExpressionClause;
};

export type AllocatedEvent = {
  flag: string;
  event: EventDefinition;
};

export type EventAllocation = {
  events: AllocatedEvent[];
  flagFor: (ref: EventRef) => string;
  nameFor: (ref: EventRef) => string;
};
