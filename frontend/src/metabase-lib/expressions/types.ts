import type Database from "metabase-lib/metadata/Database";

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

export type MBQLClauseFunctionConfig = {
  displayName: string;
  type: string;
  args: string[];
  requiresFeature?: string;
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
