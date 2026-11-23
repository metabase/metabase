export type DataCheckValue =
  | string
  | number
  | boolean
  | null
  | DataCheckValue[]
  | { [key: string]: DataCheckValue };

export type DataCheckRow = Record<string, DataCheckValue>;

export type DataCheckSeverity = "error" | "warn";

export type DataCheckStatus = "pass" | "fail" | "warn" | "error";

export type DataCheckKind = "row" | "table" | "schema";

export type DataCheckParams = Record<string, DataCheckValue>;

export type DataCheckDefinition = {
  check: string;
  table: string;
  name?: string;
  where?: string;
  severity?: DataCheckSeverity;
  params: DataCheckParams;
};

export type DataCheckResult = {
  id: string;
  display: string;
  check: string;
  table: string;
  severity: DataCheckSeverity;
  status: DataCheckStatus;
  reason?: string;
  metric?: DataCheckValue;
  threshold?: DataCheckValue;
  message?: string;
  "failing-rows"?: DataCheckRow[];
  sql?: string | null;
  "duration-ms"?: number;
};

export type DataCheckRun = {
  definition: DataCheckDefinition;
  result: DataCheckResult;
};

export type DataCheckExample = {
  definition: DataCheckDefinition;
  passing: DataCheckResult;
  failing: DataCheckResult;
};

export type DataCheckFixture = {
  examples: DataCheckExample[];
  extras: DataCheckRun[];
  ordersSuite: DataCheckRun[];
  ordersSuitePassing: DataCheckRun[];
};

export type DataCheckParamType =
  | "column"
  | "columns"
  | "column_ref"
  | "table_ref"
  | "integer"
  | "number"
  | "fraction"
  | "boolean"
  | "date"
  | "duration"
  | "sql"
  | "string"
  | "list"
  | "enum";

export type DataCheckParamSpec = {
  name: string;
  type: DataCheckParamType;
  required?: boolean;
  options?: readonly string[];
};

export type DataCheckViewType =
  | "rows"
  | "band"
  | "comparison"
  | "list"
  | "gaps"
  | "history";

export type DataCheckBandFormat = "number" | "percent" | "duration";

export type DataCheckBandSpec = {
  format: DataCheckBandFormat;
  minParam?: string;
  maxParam?: string;
  equalsParam?: string;
  minValue?: number;
  unit?: string;
};

export type DataCheckCatalogueEntry = {
  name: string;
  category: number;
  kind: DataCheckKind;
  view: DataCheckViewType;
  summary: string;
  params: readonly DataCheckParamSpec[];
  band?: DataCheckBandSpec;
  unsupported?: boolean;
};
