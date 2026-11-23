import { msgid, ngettext, t } from "ttag";

import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import type {
  DataCheckBandFormat,
  DataCheckCatalogueEntry,
  DataCheckDefinition,
  DataCheckResult,
  DataCheckRow,
  DataCheckValue,
} from "./types";

export type DataCheckDisplayStatus =
  | "pass"
  | "fail"
  | "warn"
  | "error"
  | "unsupported";

export function getDataCheckDisplayStatus(
  result: Pick<DataCheckResult, "status" | "reason">,
): DataCheckDisplayStatus {
  if (result.status === "error" && result.reason === "unsupported") {
    return "unsupported";
  }
  return result.status;
}

type StatusPresentation = {
  label: string;
  icon: IconName;
  color: ColorName;
};

export function getDataCheckStatusPresentation(
  status: DataCheckDisplayStatus,
): StatusPresentation {
  const presentations: Record<DataCheckDisplayStatus, StatusPresentation> = {
    pass: {
      label: t`Passed`,
      icon: "check_filled",
      color: "feedback-positive",
    },
    fail: {
      label: t`Failed`,
      icon: "warning_round_filled",
      color: "feedback-negative",
    },
    warn: {
      label: t`Warning`,
      icon: "warning_triangle_filled",
      color: "feedback-warning",
    },
    error: { label: t`Couldn't run`, icon: "unknown", color: "text-secondary" },
    unsupported: {
      label: t`Can't run yet`,
      icon: "hourglass",
      color: "text-secondary",
    },
  };
  return presentations[status];
}

export type DataCheckProblem = {
  title: string;
  explanation: string;
  action: string;
  showsEngineMessage: boolean;
};

export function getDataCheckProblem(
  result: Pick<DataCheckResult, "reason" | "message">,
  needsHistory: boolean,
): DataCheckProblem {
  switch (result.reason) {
    case "unsupported":
      return {
        title: t`This check can't run yet`,
        explanation: needsHistory
          ? t`It compares today's numbers with earlier runs, and earlier runs aren't stored yet.`
          : (result.message ?? t`It needs something that isn't available yet.`),
        action: t`Nothing is wrong with your data or with the check. It will start running once this is available.`,
        showsEngineMessage: false,
      };
    case "sql":
      return {
        title: t`The database rejected this check's query`,
        explanation: t`The check didn't finish, so it says nothing about your data yet.`,
        action: t`Make sure the table and columns the check names still exist, then run it again.`,
        showsEngineMessage: true,
      };
    case "validation":
      return {
        title: t`This check is written incorrectly`,
        explanation: t`It was skipped before reaching the database, so it says nothing about your data yet.`,
        action: t`Fix the definition, then run it again.`,
        showsEngineMessage: true,
      };
    case "compile":
      return {
        title: t`This check uses an option that can't be run`,
        explanation: t`It was skipped before reaching the database, so it says nothing about your data yet.`,
        action: t`Change the definition, then run it again.`,
        showsEngineMessage: true,
      };
    default:
      return {
        title: t`This check didn't finish`,
        explanation: t`It says nothing about your data yet.`,
        action: t`Run it again.`,
        showsEngineMessage: true,
      };
  }
}

export function formatDataCheckStatusCount(
  status: DataCheckDisplayStatus,
  count: number,
) {
  switch (status) {
    case "pass":
      return t`${count} passed`;
    case "fail":
      return t`${count} failed`;
    case "warn":
      return ngettext(msgid`${count} warning`, `${count} warnings`, count);
    case "error":
      return t`${count} couldn't run`;
    case "unsupported":
      return t`${count} can't run yet`;
  }
}

export function formatDataCheckTotal(count: number) {
  return ngettext(msgid`${count} check`, `${count} checks`, count);
}

const NUMBER_FORMAT = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
});

export function formatDataCheckNumber(value: number) {
  return NUMBER_FORMAT.format(value);
}

export function formatDataCheckPercent(fraction: number) {
  const percent = fraction * 100;
  const digits = percent !== 0 && Math.abs(percent) < 1 ? 3 : 2;
  return `${Number(percent.toFixed(digits))}%`;
}

const DURATION_PARTS = [
  { suffix: "d", seconds: 86400 },
  { suffix: "h", seconds: 3600 },
  { suffix: "m", seconds: 60 },
] as const;

export function formatDataCheckDuration(totalSeconds: number) {
  let rest = Math.max(0, Math.floor(totalSeconds));
  const parts: string[] = [];
  for (const { suffix, seconds } of DURATION_PARTS) {
    const amount = Math.floor(rest / seconds);
    rest -= amount * seconds;
    if (amount > 0) {
      parts.push(`${amount}${suffix}`);
    }
  }
  return parts.length > 0 ? parts.join(" ") : `${rest}s`;
}

const DURATION_UNIT_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
  w: 604800,
  mo: 2592000,
  y: 31536000,
};

function getDurationUnitSeconds(unit: string) {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("mo")) {
    return DURATION_UNIT_SECONDS.mo;
  }
  if (normalized.startsWith("mi")) {
    return DURATION_UNIT_SECONDS.m;
  }
  return DURATION_UNIT_SECONDS[normalized.charAt(0)];
}

export function parseDataCheckDuration(duration: string): number | null {
  const parts = [...duration.matchAll(/(\d+)\s*([A-Za-z]+)/g)];
  if (parts.length === 0) {
    return null;
  }
  let total = 0;
  for (const [, amount, unit] of parts) {
    const unitSeconds = getDurationUnitSeconds(unit);
    if (unitSeconds == null) {
      return null;
    }
    total += Number(amount) * unitSeconds;
  }
  return total;
}

export function formatDataCheckBandValue(
  value: number,
  format: DataCheckBandFormat,
) {
  switch (format) {
    case "percent":
      return formatDataCheckPercent(value);
    case "duration":
      return formatDataCheckDuration(value);
    case "number":
      return formatDataCheckNumber(value);
  }
}

export function formatDataCheckValue(
  value: DataCheckValue | undefined,
): string {
  if (value === undefined) {
    return "";
  }
  if (value === null) {
    return "NULL";
  }
  if (typeof value === "number") {
    return formatDataCheckNumber(value);
  }
  if (typeof value === "string") {
    return value.replace(/ 00:00:00\.0$/, "");
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(formatDataCheckValue).join(", ");
  }
  return JSON.stringify(value);
}

export function formatDataCheckCellValue(value: DataCheckValue | undefined) {
  return typeof value === "number"
    ? String(value)
    : formatDataCheckValue(value);
}

export type DataCheckBand = {
  value: number;
  min?: number;
  max?: number;
  format: DataCheckBandFormat;
  unit?: string;
};

function getBandBound(
  value: DataCheckValue | undefined,
  format: DataCheckBandFormat,
): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && format === "duration") {
    return parseDataCheckDuration(value) ?? undefined;
  }
  return undefined;
}

export function getDataCheckBand(
  definition: DataCheckDefinition,
  result: DataCheckResult,
  entry: DataCheckCatalogueEntry,
): DataCheckBand | null {
  const { band } = entry;
  if (band == null || typeof result.metric !== "number") {
    return null;
  }
  const { params } = definition;
  const equals =
    band.equalsParam != null
      ? getBandBound(params[band.equalsParam], band.format)
      : undefined;
  const min =
    equals ??
    (band.minParam != null
      ? getBandBound(params[band.minParam], band.format)
      : undefined) ??
    band.minValue;
  const max =
    equals ??
    [band.maxParam, band.maxParamFallback]
      .map((name) =>
        name != null ? getBandBound(params[name], band.format) : undefined,
      )
      .find((bound) => bound != null);
  if (min == null && max == null) {
    return null;
  }
  return {
    value: result.metric,
    min,
    max,
    format: band.format,
    unit: band.unit,
  };
}

export function getDataCheckHighlightedColumns(
  definition: DataCheckDefinition,
  entry: DataCheckCatalogueEntry | undefined,
): string[] {
  const columns = (entry?.params ?? []).flatMap((spec) => {
    const value = definition.params[spec.name];
    if (spec.type === "column" && typeof value === "string") {
      return [value];
    }
    if (spec.type === "columns" && Array.isArray(value)) {
      return value.filter((item) => typeof item === "string");
    }
    return [];
  });
  return [
    ...columns,
    "occurrences",
    "row_count",
    "previous_value",
    "next_lower",
  ];
}

export function getDataCheckRowColumns(rows: readonly DataCheckRow[]) {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const column of Object.keys(row)) {
      columns.add(column);
    }
  }
  return [...columns];
}

export function isDataCheckRecord(
  value: DataCheckValue | undefined,
): value is { [key: string]: DataCheckValue } {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function formatYamlScalar(value: DataCheckValue): string {
  if (typeof value === "string") {
    return /^[A-Za-z_][A-Za-z0-9_.]*$/.test(value)
      ? value
      : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatYamlScalar).join(", ")}]`;
  }
  if (isDataCheckRecord(value)) {
    const pairs = Object.entries(value).map(
      ([key, item]) => `${key}: ${formatYamlScalar(item)}`,
    );
    return `{${pairs.join(", ")}}`;
  }
  return String(value);
}

export function formatDataCheckYaml(definition: DataCheckDefinition) {
  const { params, ...common } = definition;
  const lines = [...Object.entries(common), ...Object.entries(params)]
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${formatYamlScalar(value)}`);
  return lines
    .map((line, index) => (index === 0 ? `- ${line}` : `  ${line}`))
    .join("\n");
}
