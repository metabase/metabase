import type { Revision } from "metabase-types/api";

export type RevisionActionDescriptor = (revision: Revision) => string;

export type DefinitionType = "filters" | "aggregations";

export type RevisionDiffOptions = {
  definitionLabel: string;
  definitionType: DefinitionType;
};
