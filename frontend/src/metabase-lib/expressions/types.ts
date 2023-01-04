import type { Database } from "metabase-types/api/database";

export interface HelpText {
  name: string;
  args: HelpTextArg[];
  description: string;
  example: string;
  structure: string;
  docsPage?: string;
}

export interface HelpTextConfig {
  name: string;
  args: HelpTextArg[];
  description: (database: Database, reportTimezone: string) => string;
  example: string;
  structure: string;
  docsPage?: string;
}

export interface HelpTextArg {
  name: string;
  description: string;
}
