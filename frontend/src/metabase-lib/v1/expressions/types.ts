import type * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseFeature } from "metabase-types/api";

import type { DefinedClauseName } from "./clause";
import type { Token } from "./pratt";

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
    | Lib.ExpressionParts
    | Lib.ExpressionArg
    | (Lib.ExpressionParts | Lib.ExpressionArg)[];
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
  description?(database: Database, reportTimezone?: string): string;
  docsPage?: string;
};

export type Hooks = {
  error?: (error: Error) => void;
  lexified?: (evt: { tokens: Token[] }) => void;
  compiled?: (evt: {
    expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
    expressionClause: Lib.ExpressionClause;
  }) => void;
};
