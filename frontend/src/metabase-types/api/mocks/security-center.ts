import type {
  Advisory,
  EmailChannelSpec,
  HealthCheck,
  HealthCheckItem,
  SlackChannelSpec,
} from "metabase-types/api";

export function createMockEmailChannelSpec(
  overrides: Partial<EmailChannelSpec> = {},
): EmailChannelSpec {
  return {
    type: "email",
    name: "Email",
    schedules: [],
    schedule_type: null,
    allows_recipients: true,
    configured: true,
    recipients: ["user", "email"],
    ...overrides,
  };
}

export function createMockSlackChannelSpec(
  overrides: Partial<SlackChannelSpec> = {},
): SlackChannelSpec {
  return {
    type: "slack",
    name: "Slack",
    schedules: [],
    schedule_type: null,
    allows_recipients: false,
    configured: false,
    fields: [
      {
        name: "channel",
        displayName: "Post to",
        options: [
          { displayName: "#general", id: "C001" },
          { displayName: "#security", id: "C002" },
        ],
        required: true,
      },
    ],
    ...overrides,
  };
}

export function createAdvisory(overrides: Partial<Advisory> = {}): Advisory {
  return {
    advisory_id: "SA-001",
    title: "Test advisory",
    description: "desc",
    severity: "medium",
    advisory_url: null,
    remediation: "Upgrade",
    published_at: "2026-01-01T00:00:00Z",
    match_status: "not_affected",
    last_evaluated_at: null,
    acknowledged_by: null,
    acknowledged_at: null,
    affected_versions: [{ min: "0.45.0", fixed: "0.59.0" }],
    download_jar_urls: [],
    ...overrides,
  };
}

export const createMockHealthCheckItem = (
  overrides: HealthCheckItem = { status: "pass" },
): HealthCheckItem => ({
  message: "Test item",
  ...overrides,
});

export const createMockHealthCheck = (
  overrides: Partial<HealthCheck> = {},
): HealthCheck => ({
  id: "https-redirect",
  severity: "medium",
  title: "Requests are redirected to HTTPS",
  description: "Plain HTTP exposes sessions.",
  remediation: "Turn on the redirect in Admin settings.",
  docs: { page: "configuring-metabase/settings" },
  requires_restart: false,
  status: "pass",
  running: false,
  checked_at: "2026-10-29T10:00:00Z",
  items: [createMockHealthCheckItem()],
  ...overrides,
});
