import type {
  AlertUpgradeVersion,
  GithubProps,
  VersionInfoFile,
} from "./types";
import {
  getCanonicalVersion,
  getOSSVersion,
  isValidVersionString,
  versionSort,
} from "./version-helpers";

const GHSA_RE = /GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i;
const MIN_VERSION = "v0.0.0";

export const DEFAULT_ALERT_MESSAGE_TEMPLATE =
  "**This version of Metabase has a {severity} security vulnerability. Upgrade to {fixed} or later to receive important security updates. [View upgrade instructions](https://www.metabase.com/docs/latest/installation-and-operation/upgrading-metabase)**";

export type AlertUpgradeRange = {
  min: string;
  fixed: string;
};

export type AdvisoryVulnerability = {
  vulnerable_version_range: string | null;
  patched_versions: string | null;
};

export type Advisory = {
  id: string;
  html_url: string;
  severity: string | null;
  summary: string | null;
  vulnerabilities: AdvisoryVulnerability[];
};

export type AdvisoryGithub = {
  rest: {
    securityAdvisories: {
      getRepositoryAdvisory: (params: {
        owner: string;
        repo: string;
        ghsa_id: string;
      }) => Promise<{ data: unknown }>;
    };
  };
};

export type AlertUpgradeVersionsDiff = {
  added: AlertUpgradeVersion[];
  removed: AlertUpgradeVersion[];
  changed: Array<{ from: AlertUpgradeVersion; to: AlertUpgradeVersion }>;
  otherKeysDiffer: boolean;
};

export function parseGhsaId(input: string): string {
  const match = GHSA_RE.exec(input.trim());
  if (!match) {
    throw new Error(`Not a GHSA id or advisory URL: ${input}`);
  }
  return `GHSA-${match[0].slice(5).toLowerCase()}`;
}

export function normalizeAdvisoryVersion(raw: string): string {
  const trimmed = raw.trim();
  if (isValidVersionString(trimmed)) {
    return getOSSVersion(trimmed);
  }

  const normalized = trimmed.replace(/^v/i, "").replace(/^(x|0|1)\./, "v0.");
  if (isValidVersionString(normalized)) {
    return normalized;
  }

  throw new Error(`Cannot normalize version: ${raw}`);
}

export async function fetchAdvisory({
  github,
  owner,
  repo,
  ghsaId,
}: Pick<GithubProps, "owner" | "repo"> & {
  github: AdvisoryGithub;
  ghsaId: string;
}): Promise<Advisory> {
  const { data } = await github.rest.securityAdvisories.getRepositoryAdvisory({
    owner,
    repo,
    ghsa_id: ghsaId,
  });
  return mapAdvisory(data);
}

export function advisoryToRanges(advisory: Advisory): {
  ranges: AlertUpgradeRange[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const parsed: AlertUpgradeRange[] = [];

  if (advisory.vulnerabilities.length === 0) {
    throw new Error(
      "Advisory has no vulnerabilities; pass --min and --fixed instead",
    );
  }

  for (const vulnerability of advisory.vulnerabilities) {
    parsed.push(parseVulnerability(vulnerability, warnings));
  }

  const ranges = collapseRanges(parsed, warnings);
  ranges.sort((a, b) => versionSort(a.min, b.min));
  return { ranges, warnings };
}

export function toEditionEntry(
  range: AlertUpgradeRange,
  edition: "oss" | "ee",
  message: string,
): AlertUpgradeVersion {
  return {
    min: getCanonicalVersion(normalizeAdvisoryVersion(range.min), edition),
    fixed: getCanonicalVersion(normalizeAdvisoryVersion(range.fixed), edition),
    message,
  };
}

export function buildMessage({
  template = DEFAULT_ALERT_MESSAGE_TEMPLATE,
  fixed,
  severity,
  url,
}: {
  template?: string;
  fixed: string;
  severity: string;
  url: string;
}): string {
  return template
    .replaceAll("{fixed}", fixed)
    .replaceAll("{severity}", severity)
    .replaceAll("{url}", url);
}

export function isAlertUpgradeVersion(
  value: unknown,
): value is AlertUpgradeVersion {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("min" in value) || typeof value.min !== "string") {
    return false;
  }
  if (!("fixed" in value) || typeof value.fixed !== "string") {
    return false;
  }
  if (!("message" in value) || typeof value.message !== "string") {
    return false;
  }
  if ("id" in value && value.id !== undefined && typeof value.id !== "string") {
    return false;
  }
  return true;
}

export function assertValidAlertUpgradeVersions(
  entries: unknown,
): asserts entries is AlertUpgradeVersion[] {
  if (!Array.isArray(entries)) {
    throw new Error("alert_upgrade_versions must be an array");
  }

  for (const entry of entries) {
    if (!isAlertUpgradeVersion(entry)) {
      throw new Error(
        `Invalid alert_upgrade_versions entry: ${JSON.stringify(entry)}`,
      );
    }
    if (versionSort(entry.fixed, entry.min) <= 0) {
      throw new Error(
        `fixed must be greater than min: ${entry.min} -> ${entry.fixed}`,
      );
    }
  }
}

export function upsertAlertUpgradeVersions(
  versionInfo: VersionInfoFile,
  entries: AlertUpgradeVersion[],
  id?: string,
): VersionInfoFile {
  const existing = versionInfo.alert_upgrade_versions ?? [];
  const kept = id ? existing.filter((entry) => entry.id !== id) : existing;
  const alert_upgrade_versions = [...kept, ...entries].sort((a, b) =>
    versionSort(a.min, b.min),
  );

  return {
    ...versionInfo,
    alert_upgrade_versions,
  };
}

export function diffAlertUpgradeVersions(
  remote: VersionInfoFile,
  local: VersionInfoFile,
): AlertUpgradeVersionsDiff {
  const remoteEntries = remote.alert_upgrade_versions ?? [];
  const localEntries = local.alert_upgrade_versions ?? [];

  const remoteByKey = new Map(
    remoteEntries.map((entry) => [entryIdentity(entry), entry]),
  );
  const localByKey = new Map(
    localEntries.map((entry) => [entryIdentity(entry), entry]),
  );

  const added: AlertUpgradeVersion[] = [];
  const removed: AlertUpgradeVersion[] = [];
  const changed: Array<{ from: AlertUpgradeVersion; to: AlertUpgradeVersion }> =
    [];

  for (const [key, localEntry] of localByKey) {
    const remoteEntry = remoteByKey.get(key);
    if (!remoteEntry) {
      added.push(localEntry);
    } else if (remoteEntry.message !== localEntry.message) {
      changed.push({ from: remoteEntry, to: localEntry });
    }
  }

  for (const [key, remoteEntry] of remoteByKey) {
    if (!localByKey.has(key)) {
      removed.push(remoteEntry);
    }
  }

  return {
    added,
    removed,
    changed,
    otherKeysDiffer:
      stringifyWithoutAlertVersions(remote) !==
      stringifyWithoutAlertVersions(local),
  };
}

function mapAdvisory(data: unknown): Advisory {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid advisory response");
  }

  if (!("ghsa_id" in data) || typeof data.ghsa_id !== "string") {
    throw new Error("Advisory response missing ghsa_id");
  }
  if (!("html_url" in data) || typeof data.html_url !== "string") {
    throw new Error("Advisory response missing html_url");
  }

  const severity =
    "severity" in data && typeof data.severity === "string"
      ? data.severity
      : null;
  const summary =
    "summary" in data && typeof data.summary === "string" ? data.summary : null;

  const rawVulnerabilities =
    "vulnerabilities" in data && Array.isArray(data.vulnerabilities)
      ? data.vulnerabilities
      : [];

  return {
    id: data.ghsa_id,
    html_url: data.html_url,
    severity,
    summary,
    vulnerabilities: rawVulnerabilities.map(mapVulnerability),
  };
}

function mapVulnerability(value: unknown): AdvisoryVulnerability {
  if (typeof value !== "object" || value === null) {
    return { vulnerable_version_range: null, patched_versions: null };
  }

  const vulnerable_version_range =
    "vulnerable_version_range" in value &&
    typeof value.vulnerable_version_range === "string"
      ? value.vulnerable_version_range
      : null;

  return {
    vulnerable_version_range,
    patched_versions: readPatchedVersions(value),
  };
}

function readPatchedVersions(value: object): string | null {
  if (
    "patched_versions" in value &&
    typeof value.patched_versions === "string" &&
    value.patched_versions.trim() !== ""
  ) {
    return value.patched_versions;
  }

  if (
    "first_patched_version" in value &&
    typeof value.first_patched_version === "object" &&
    value.first_patched_version !== null &&
    "identifier" in value.first_patched_version &&
    typeof value.first_patched_version.identifier === "string" &&
    value.first_patched_version.identifier.trim() !== ""
  ) {
    return value.first_patched_version.identifier;
  }

  return null;
}

const RANGE_OPS = [">=", "<=", ">", "<", "="] as const;
type RangeOp = (typeof RANGE_OPS)[number];

type RangeBound = {
  op: RangeOp;
  version: string;
};

function isRangeOp(value: string | undefined): value is RangeOp {
  return value !== undefined && RANGE_OPS.some((op) => op === value);
}

function parseVulnerability(
  vulnerability: AdvisoryVulnerability,
  warnings: string[],
): AlertUpgradeRange {
  const rangeText = vulnerability.vulnerable_version_range;
  if (!rangeText) {
    throw new Error(
      "Vulnerability is missing vulnerable_version_range; pass --min and --fixed instead",
    );
  }

  const bounds = parseRangeBounds(rangeText);
  const hasInclusiveUpper = bounds.some(
    (bound) => bound.op === "<=" || bound.op === "=",
  );
  const hasExclusiveUpper = bounds.some((bound) => bound.op === "<");
  const hasUnsupportedLower = bounds.some((bound) => bound.op === ">");

  if (hasUnsupportedLower) {
    throw new Error(
      `Unsupported version range "${rangeText}"; pass --min and --fixed instead`,
    );
  }

  const lower = bounds.find((bound) => bound.op === ">=");
  const exclusiveUpper = bounds.find((bound) => bound.op === "<");
  const exact = bounds.find((bound) => bound.op === "=");

  const patched = vulnerability.patched_versions
    ? normalizeAdvisoryVersion(
        stripPatchedPrefix(vulnerability.patched_versions),
      )
    : null;

  if (hasInclusiveUpper && !hasExclusiveUpper && !patched) {
    throw new Error(
      `Range "${rangeText}" uses <= or = without a patched version; pass --min and --fixed instead`,
    );
  }

  const min = exact
    ? normalizeAdvisoryVersion(exact.version)
    : lower
      ? normalizeAdvisoryVersion(lower.version)
      : MIN_VERSION;

  const exclusiveFixed = exclusiveUpper
    ? normalizeAdvisoryVersion(exclusiveUpper.version)
    : null;
  const fixed = patched ?? exclusiveFixed;

  if (!fixed) {
    throw new Error(
      `Range "${rangeText}" has no exclusive upper bound or patched version; pass --min and --fixed instead`,
    );
  }

  if (patched && exclusiveFixed && patched !== exclusiveFixed) {
    warnings.push(
      `patched_versions ${patched} disagrees with < bound ${exclusiveFixed} in "${rangeText}"; using patched version`,
    );
  }

  return { min, fixed };
}

function parseRangeBounds(rangeText: string): RangeBound[] {
  const parts = rangeText
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.map((part) => {
    const match = /^(>=|<=|>|<|=)\s*(.+)$/.exec(part);
    if (!match || !isRangeOp(match[1])) {
      throw new Error(
        `Cannot parse version range "${rangeText}"; pass --min and --fixed instead`,
      );
    }
    return { op: match[1], version: match[2].trim() };
  });
}

function stripPatchedPrefix(patched: string): string {
  return patched.replace(/^(>=|>)\s*/, "").trim();
}

function collapseRanges(
  ranges: AlertUpgradeRange[],
  warnings: string[],
): AlertUpgradeRange[] {
  const lowestMinByFixed = new Map<string, string>();

  for (const range of ranges) {
    const existingMin = lowestMinByFixed.get(range.fixed);
    if (!existingMin || versionSort(range.min, existingMin) < 0) {
      lowestMinByFixed.set(range.fixed, range.min);
    }
  }

  if (lowestMinByFixed.size < ranges.length) {
    warnings.push(
      `Collapsed ${ranges.length} vulnerability ranges into ${lowestMinByFixed.size} by taking the lowest min for each fixed version`,
    );
  }

  return [...lowestMinByFixed.entries()].map(([fixed, min]) => ({
    min,
    fixed,
  }));
}

function entryIdentity(entry: AlertUpgradeVersion): string {
  return [entry.id ?? "", entry.min, entry.fixed].join("\0");
}

function stringifyWithoutAlertVersions(file: VersionInfoFile): string {
  const { alert_upgrade_versions: _ignored, ...rest } = file;
  return JSON.stringify(rest);
}
