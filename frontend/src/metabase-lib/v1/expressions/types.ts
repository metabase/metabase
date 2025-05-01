import type * as Lib from "metabase-lib";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseFeature, Expression } from "metabase-types/api";

import type { DefinedClauseName } from "./config";
import type { Token } from "./pratt";

export type MBQLClauseCategory =
  | "logical"
  | "math"
  | "string"
  | "date"
  | "conversion"
  | "window"
  | "aggregation";

export interface HelpText {
  name: string;
  category: MBQLClauseCategory;
  args?: HelpTextArg[]; // no args means that expression function doesn't accept any parameters, e.g. "CumulativeCount"
  description: string;
  example: Lib.ExpressionParts;
  structure: string;
  docsPage?: string;
}

export interface HelpTextConfig {
  name: DefinedClauseName;
  category: MBQLClauseCategory;
  args?: HelpTextArg[]; // no args means that expression function doesn't accept any parameters, e.g. "CumulativeCount"
  description: (database: Database, reportTimezone?: string) => string;
  structure: string;
  docsPage?: string;
}

interface HelpTextArg {
  name: string;
  description: string;
  example: Expression | ["args", Expression[]];
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

export type MBQLClauseFunctionConfig = {
  displayName: string;
  type: ExpressionType;
  args: ExpressionType[];
  argType(index: number, args: unknown[], type: ExpressionType): ExpressionType;
  requiresFeature?: DatabaseFeature;
  hasOptions?: boolean;
  multiple?: boolean;
  name: DefinedClauseName;

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
