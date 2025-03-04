import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseFeature } from "metabase-types/api";

import type { OPERATOR, TOKEN } from "./tokenizer";

export interface HelpText {
  name: string;
  args?: HelpTextArg[]; // no args means that expression function doesn't accept any parameters, e.g. "CumulativeCount"
  description: string;
  example: string;
  structure: string;
  docsPage?: string;
}

export interface HelpTextConfig {
  name: string;
  args?: HelpTextArg[]; // no args means that expression function doesn't accept any parameters, e.g. "CumulativeCount"
  description: (database: Database, reportTimezone?: string) => string;
  structure: string;
  docsPage?: string;
}

interface HelpTextArg {
  name: string;
  description: string;
  example: string;
}

type MBQLClauseFunctionReturnType =
  | "aggregation"
  | "any"
  | "boolean"
  | "datetime"
  | "expression"
  | "number"
  | "string";

export type MBQLClauseFunctionConfig = {
  displayName: string;
  type: MBQLClauseFunctionReturnType;
  args: string[];
  requiresFeature?: DatabaseFeature;
  hasOptions?: boolean;
  multiple?: boolean;
  tokenName?: string;
  name?: string;

  validator?: (...args: any) => string | undefined;
};
export type MBQLClauseMap = Record<string, MBQLClauseFunctionConfig>;

export type ErrorWithMessage = {
  message: string;
  pos?: number | null;
  len?: number | null;
};

export type Token =
  | {
      type: TOKEN.Operator;
      start: number;
      end: number;
      op: OPERATOR;
    }
  | {
      type: TOKEN.Number;
      start: number;
      end: number;
    }
  | {
      type: TOKEN.String;
      start: number;
      end: number;
      value: string;
    }
  | {
      type: TOKEN.Identifier;
      start: number;
      end: number;
      isReference: boolean;
    }
  | {
      type: TOKEN.Boolean;
      start: number;
      end: number;
      op: "true" | "false";
    };
