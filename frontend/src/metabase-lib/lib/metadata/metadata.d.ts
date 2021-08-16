interface Flavoring<FlavorT> {
    _type?: FlavorT;
}
export type Flavor<T, FlavorT> = T & Flavoring<FlavorT>;


export type EntityType = Flavor<string, "EntityType">;

export type SchemaName = Flavor<string, "SchemaName">;

// TODO: move to types.d.ts
export type DatabaseFeature =
  | "basic-aggregations"
  | "standard-deviation-aggregations"
  | "expression-aggregations"
  | "foreign-keys"
  | "native-parameters"
  | "nested-queries"
  | "expressions"
  | "case-sensitivity-string-filter-options"
  | "binning";

export type FieldValues = Flavor<any, "FieldValues">;


// TODO: move to query.d.ts
export type Aggregation = Flavor<any, "Aggregation">;
export type FilterClause = Flavor<any, "FilterClause">;
export type StructuredQuery = Flavor<any, "StructuredQuery">;