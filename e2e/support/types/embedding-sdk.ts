export type EntityTypeToInjectIds = "collection" | "dashboard" | "question";

export type InjectedEntityIdGetterParameters = {
  fileName: string;
  entityType: EntityTypeToInjectIds;
  occurrenceIndex: number;
};
