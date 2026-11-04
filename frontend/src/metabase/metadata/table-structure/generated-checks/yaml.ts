import type {
  CheckParamValue,
  CheckSqlValue,
  CheckTableRef,
  GeneratedCheck,
} from "./types";

const PLAIN_SCALAR_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const RESERVED_SCALARS = new Set([
  "true",
  "false",
  "yes",
  "no",
  "on",
  "off",
  "null",
  "y",
  "n",
]);

export function formatTableRef({ schema, name }: CheckTableRef) {
  return schema ? `${schema}.${name}` : name;
}

export function formatColumnRef(table: CheckTableRef, column: string) {
  return `${formatTableRef(table)}.${column}`;
}

const isSqlValue = (value: CheckParamValue): value is CheckSqlValue =>
  typeof value === "object" && "sql" in value;

function formatScalar(value: string | number | boolean) {
  if (typeof value !== "string") {
    return String(value);
  }
  const isPlain =
    PLAIN_SCALAR_RE.test(value) && !RESERVED_SCALARS.has(value.toLowerCase());
  return isPlain ? value : JSON.stringify(value);
}

function formatValue(value: CheckParamValue): string {
  if (isSqlValue(value)) {
    return `{sql: ${JSON.stringify(value.sql)}}`;
  }
  if (typeof value === "object") {
    const items: readonly (string | number)[] = value;
    return `[${items.map(formatScalar).join(", ")}]`;
  }
  return formatScalar(value);
}

function formatCheck(check: GeneratedCheck) {
  const lines = [
    `  - check: ${check.check}`,
    `    table: ${formatTableRef(check.table)}`,
    ...Object.entries(check.params).map(
      ([key, value]) => `    ${key}: ${formatValue(value)}`,
    ),
    `    name: ${JSON.stringify(check.name)}`,
  ];
  if (check.where != null) {
    lines.push(`    where: ${JSON.stringify(check.where)}`);
  }
  if (check.severity === "warn") {
    lines.push("    severity: warn");
  }
  return lines.join("\n");
}

export function formatChecksYaml(checks: readonly GeneratedCheck[]) {
  if (checks.length === 0) {
    return "checks: []\n";
  }
  return `checks:\n${checks.map(formatCheck).join("\n\n")}\n`;
}
