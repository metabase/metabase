import type { Revision } from "metabase-types/api";

export type RevisionActionDescriptor = (revision: Revision) => string;

export type DefinitionType = "filters" | "aggregations";
