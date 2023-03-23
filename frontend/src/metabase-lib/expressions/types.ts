import type { Database } from "metabase-types/api/database";

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
  description: (database: Database, reportTimezone: string) => string;
  structure: string;
  docsPage?: string;
}

interface HelpTextArg {
  name: string;
  description: string;
  example: string;
}
