import type { Field, Table } from "metabase-types/api";

type FieldsFilter = (fields: Field[]) => Field[];

export type AggregationOperator = {
  name: string;
  short: string;
  fields: Field[];
  validFieldsFilters: FieldsFilter[];
};

type ValidArgumentsFilter = (field: Field, table: Table) => boolean;

type FilterOperatorField = {
  type: string;
  values: {
    name: string;
    key: string;
  }[];
};

export type FilterOperator = {
  name: string;
  verboseName: string;
  moreVerboseName: string;
  fields: FilterOperatorField[];
  multi: boolean;
  placeholders?: string[];
  validArgumentsFilters: ValidArgumentsFilter[];
};
