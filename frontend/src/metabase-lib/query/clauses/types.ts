import type { Database, DatabaseFeature } from "metabase-types/api";

import type { ExpressionArg, ExpressionParts } from "../types";

import type { DefinedClauseName } from "./clauses";

export enum MBQLClauseCategory {
  Logical = "logical",
  Math = "math",
  String = "string",
  Date = "date",
  Conversion = "conversion",
  Window = "window",
  Aggregation = "aggregation",
}

export type ExpressionType =
  | "aggregation"
  | "any"
  | "boolean"
  | "datetime"
  | "expression"
  | "number"
  | "string";

export type ClauseArgDefinition = {
  name: string;
  type: ExpressionType;
  description?: string;
  example?:
    | ExpressionParts
    | ExpressionArg
    | (ExpressionParts | ExpressionArg)[];
  template?: string;
  optional?: boolean;
};

export type MBQLClauseDefinition = {
  name?: never;
  displayName: string;
  type: ExpressionType;
  args(): ClauseArgDefinition[];
  argType?(
    index: number,
    args: unknown[],
    type: ExpressionType,
  ): ExpressionType;
  requiresFeature?: DatabaseFeature;
  hasOptions?: boolean;
  multiple?: boolean;
  category?: MBQLClauseCategory;
  validator?: (...args: any) => string | undefined;
  description?(database: Database, reportTimezone?: string): string;
  docsPage?: string;
};

type DatabaseOptions = {
  engine?: string | undefined;
  features?: DatabaseFeature[] | undefined;
};

export type MBQLClauseFunctionConfig = {
  name: DefinedClauseName;
  displayName: string;
  type: ExpressionType;
  args: ClauseArgDefinition[];
  argType(index: number, args: unknown[], type: ExpressionType): ExpressionType;
  requiresFeature?: DatabaseFeature;
  hasOptions: boolean;
  multiple: boolean;
  category?: MBQLClauseCategory;
  validator?: (...args: any) => string | undefined;
  description?(database: DatabaseOptions, reportTimezone?: string): string;
  docsPage?: string;
};
