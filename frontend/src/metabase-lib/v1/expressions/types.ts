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

export interface HelpText {
  name: string;
  category: MBQLClauseCategory;
  args: HelpTextArg[];
  description: string;
  example: Lib.ExpressionParts;
  displayName: string;
  docsUrl: string;
}

export interface HelpTextConfig {
  name: DefinedClauseName;
  category: MBQLClauseCategory;
  args: () => HelpTextArg[];
  description: (database: Database, reportTimezone?: string) => string;
  displayName: string;
  docsPage?: string;
}

export interface HelpTextArg {
  name: string;
  description: string;
  example:
    | Lib.ExpressionParts
    | Lib.ExpressionArg
    | (Lib.ExpressionParts | Lib.ExpressionArg)[];
  template?: string;
}

export type ExpressionType =
  | "aggregation"
  | "any"
  | "boolean"
  | "datetime"
  | "expression"
  | "number"
  | "string";

export type MBQLClauseDefinition = {
  name?: never;
  displayName: string;
  type: ExpressionType;
  args: ExpressionType[];
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
};

export type MBQLClauseFunctionConfig = {
  name: DefinedClauseName;
  displayName: string;
  type: ExpressionType;
  args: ExpressionType[];
  argType(index: number, args: unknown[], type: ExpressionType): ExpressionType;
  requiresFeature?: DatabaseFeature;
  hasOptions: boolean;
  multiple: boolean;
  category?: MBQLClauseCategory;
  validator?: (...args: any) => string | undefined;
};

export type Hooks = {
  error?: (error: Error) => void;
  lexified?: (evt: { tokens: Token[] }) => void;
  compiled?: (evt: {
    expressionParts: Lib.ExpressionParts | Lib.ExpressionArg;
    expressionClause: Lib.ExpressionClause;
  }) => void;
};
