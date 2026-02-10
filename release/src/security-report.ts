import type { GithubProps } from "./types";

// Types for security alerts
export interface DependabotAlert {
  number: number;
  state: "open" | "fixed" | "dismissed" | "auto_dismissed";
  security_advisory: {
    cve_id: string | null;
    ghsa_id: string;
    summary: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  dismissed_comment: string | null;
}

export interface CodeScanningAlert {
  number: number;
  state: "open" | "fixed" | "dismissed";
  rule: {
    id: string;
    description: string;
  };
  tool: {
    name: string;
  };
  html_url: string;
  created_at: string;
  updated_at: string;
  fixed_at: string | null;
  dismissed_at: string | null;
  dismissed_reason: string | null;
  dismissed_comment: string | null;
}

export interface SecurityAlert {
  id: string;
  url: string;
  description: string;
  state: "open" | "fixed" | "dismissed";
  createdAt: string;
  updatedAt: string;
  dismissedReason?: string;
  dismissedComment?: string;
  source: "dependabot" | "code-scanning";
}

export interface SecurityReportData {
  open: SecurityAlert[];
  fixed: SecurityAlert[];
  dismissed: SecurityAlert[];
}

// Map dismissed_reason to true positive / false positive
// Dependabot: not_used, inaccurate, auto_dismissed → false positive
// Dependabot: tolerable_risk, no_bandwidth, fix_started → true positive
// Code-scanning: false positive, used in tests → false positive
// Code-scanning: won't fix → true positive
export function mapDismissedReason(reason: string | null): "true positive" | "false positive" | "unknown" {
  if (!reason) {
    return "unknown";
  }

  const falsePositiveReasons = [
    "not_used",
    "inaccurate",
    "auto_dismissed",
    "false positive",
    "used in tests",
  ];

  const truePositiveReasons = [
    "tolerable_risk",
    "no_bandwidth",
    "fix_started",
    "won't fix",
  ];

  if (falsePositiveReasons.includes(reason)) {
    return "false positive";
  }

  if (truePositiveReasons.includes(reason)) {
    return "true positive";
  }

  return "unknown";
}

export function calculateAgeDays(createdAt: string): number {
  const created = new Date(createdAt);
  const now = new Date();
  const diffMs = now.getTime() - created.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function normalizeDependabotAlert(alert: DependabotAlert): SecurityAlert {
  const id = alert.security_advisory.cve_id ?? alert.security_advisory.ghsa_id;

  return {
    id,
    url: alert.html_url,
    description: alert.security_advisory.summary,
    state: alert.state === "auto_dismissed" ? "dismissed" : alert.state,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at,
    dismissedReason: alert.state === "auto_dismissed"
      ? "auto_dismissed"
      : (alert.dismissed_reason ?? undefined),
    dismissedComment: alert.state === "auto_dismissed"
      ? "Auto-dismissed (dev dependency)"
      : (alert.dismissed_comment ?? undefined),
    source: "dependabot",
  };
}

export function normalizeCodeScanningAlert(alert: CodeScanningAlert): SecurityAlert {
  return {
    id: alert.rule.id,
    url: alert.html_url,
    description: alert.rule.description,
    state: alert.state,
    createdAt: alert.created_at,
    updatedAt: alert.updated_at,
    dismissedReason: alert.dismissed_reason ?? undefined,
    dismissedComment: alert.dismissed_comment ?? undefined,
    source: "code-scanning",
  };
}

export function filterAlertsBySinceDate(
  alerts: SecurityAlert[],
  sinceDate: string,
): SecurityAlert[] {
  const since = new Date(sinceDate);
  return alerts.filter(alert => new Date(alert.updatedAt) >= since);
}

export function categorizeAlerts(
  alerts: SecurityAlert[],
  sinceDate?: string,
): SecurityReportData {
  // Open alerts: show ALL (no date filter)
  const open = alerts.filter(a => a.state === "open");

  // Fixed and dismissed: filter by date if provided
  let fixed = alerts.filter(a => a.state === "fixed");
  let dismissed = alerts.filter(a => a.state === "dismissed");

  if (sinceDate) {
    fixed = filterAlertsBySinceDate(fixed, sinceDate);
    dismissed = filterAlertsBySinceDate(dismissed, sinceDate);
  }

  return { open, fixed, dismissed };
}

export function formatOpenAlert(alert: SecurityAlert): string {
  const ageDays = calculateAgeDays(alert.createdAt);
  return `- [${alert.id}](${alert.url}): ${alert.description}: ${ageDays} days old`;
}

export function formatFixedAlert(alert: SecurityAlert): string {
  return `- [${alert.id}](${alert.url}): ${alert.description}`;
}

export function formatDismissedAlert(alert: SecurityAlert): string {
  const tpFp = mapDismissedReason(alert.dismissedReason ?? null);
  const desc = alert.dismissedComment ?? alert.dismissedReason ?? "No reason provided";
  return `- [${alert.id}](${alert.url}): ${tpFp}: ${desc}`;
}

export function formatAlertSection(
  alerts: SecurityAlert[],
  formatter: (alert: SecurityAlert) => string,
  emptyMessage: string,
): string {
  if (alerts.length === 0) {
    return emptyMessage;
  }

  // Sort by ID descending and deduplicate
  const sorted = [...alerts].sort((a, b) => b.id.localeCompare(a.id));
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const alert of sorted) {
    const formatted = formatter(alert);
    if (!seen.has(formatted)) {
      seen.add(formatted);
      unique.push(formatted);
    }
  }

  return unique.join("\n");
}

export function generateSecurityReport(
  data: SecurityReportData,
  reportDate: string,
): string {
  const openSection = formatAlertSection(
    data.open,
    formatOpenAlert,
    "No open alerts",
  );

  const fixedSection = formatAlertSection(
    data.fixed,
    formatFixedAlert,
    "No events in the selected period",
  );

  const dismissedSection = formatAlertSection(
    data.dismissed,
    formatDismissedAlert,
    "No events in the selected period",
  );

  return `# ${reportDate}

## Open
${openSection}

## Fixed
${fixedSection}

## Dismissed
${dismissedSection}
`;
}

export async function fetchDependabotAlerts({
  github,
  owner,
  repo,
}: GithubProps): Promise<DependabotAlert[]> {
  const alerts = await github.paginate(
    "GET /repos/{owner}/{repo}/dependabot/alerts",
    { owner, repo },
  );
  return alerts as DependabotAlert[];
}

export async function fetchCodeScanningAlerts({
  github,
  owner,
  repo,
}: GithubProps): Promise<CodeScanningAlert[]> {
  const alerts = await github.paginate(
    "GET /repos/{owner}/{repo}/code-scanning/alerts",
    { owner, repo },
  );
  return alerts as CodeScanningAlert[];
}

export async function getSecurityReportData({
  github,
  owner,
  repo,
  sinceDate,
}: GithubProps & { sinceDate?: string }): Promise<SecurityReportData> {
  const [dependabotAlerts, codeScanningAlerts] = await Promise.all([
    fetchDependabotAlerts({ github, owner, repo }),
    fetchCodeScanningAlerts({ github, owner, repo }),
  ]);

  const normalizedAlerts: SecurityAlert[] = [
    ...dependabotAlerts.map(normalizeDependabotAlert),
    ...codeScanningAlerts.map(normalizeCodeScanningAlert),
  ];

  return categorizeAlerts(normalizedAlerts, sinceDate);
}

export function getDefaultSinceDate(): string {
  const date = new Date();
  date.setDate(date.getDate() - 7);
  return date.toISOString().split("T")[0];
}

export function getTodayDate(): string {
  return new Date().toISOString().split("T")[0];
}

export async function getSecurityReport({
  github,
  owner,
  repo,
  sinceDate,
}: GithubProps & { sinceDate?: string }): Promise<string> {
  const effectiveSinceDate = sinceDate ?? getDefaultSinceDate();
  const reportDate = getTodayDate();

  const data = await getSecurityReportData({
    github,
    owner,
    repo,
    sinceDate: effectiveSinceDate,
  });

  return generateSecurityReport(data, reportDate);
}
