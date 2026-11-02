import type { CollectionId } from "./collection";
import type { DatabaseId } from "./database";
import type { GroupId } from "./group";
import type { NotificationRecipient } from "./notification";

export type AdvisoryMatchStatus =
  | "active"
  | "resolved"
  | "not_affected"
  | "error";

export type AdvisoryVersionRange = {
  min: string;
  fixed: string;
};

export type AdvisoryDownloadJarUrl = {
  version: string;
  url: string;
};

export type AdvisorySeverity = "critical" | "high" | "medium" | "low";

export type AdvisoryId = string;

export type Advisory = {
  advisory_id: AdvisoryId;
  title: string;
  severity: AdvisorySeverity;
  description: string;
  advisory_url: string | null;
  remediation: string;
  published_at: string;
  match_status: AdvisoryMatchStatus;
  last_evaluated_at: string | null;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
  affected_versions: AdvisoryVersionRange[];
  download_jar_urls: AdvisoryDownloadJarUrl[];
};

export type ListAdvisoriesResponse = {
  last_checked_at: string | null;
  advisories: Advisory[];
};

export type AcknowledgeAdvisoryResponse = {
  advisory_id: string;
  match_status: AdvisoryMatchStatus;
  acknowledged_by: { id: number; common_name: string; email: string } | null;
  acknowledged_at: string | null;
};

export type AcknowledgeAdvisoriesResponse = AcknowledgeAdvisoryResponse[];

export type SendTestNotificationRequest = {
  emailRecipients: NotificationRecipient[];
  slackChannel: string | null;
};

export type HealthCheckId = string;

export type HealthCheckStatus = "pass" | "fail" | "unknown";

type HealthCheckItemBase = {
  status: HealthCheckStatus;
  message?: string;
};

type HealthCheckEntity<Type extends string, Id> = {
  entity_type: Type;
  entity_id: Id;
  entity_name: string;
};

type HealthCheckNoEntity = {
  entity_type?: undefined;
  entity_id?: undefined;
  entity_name?: undefined;
};

export type HealthCheckItem = HealthCheckItemBase &
  (
    | HealthCheckEntity<"database", DatabaseId>
    | HealthCheckEntity<"collection", CollectionId>
    | HealthCheckEntity<"group", GroupId>
    | HealthCheckNoEntity
  );

export type HealthCheckDocs = {
  page: string;
  anchor?: string;
};

export type HealthCheck = {
  id: HealthCheckId;
  severity: AdvisorySeverity;
  title: string;
  description: string;
  remediation: string;
  docs: HealthCheckDocs;
  requires_restart: boolean;
  status: HealthCheckStatus;
  running: boolean;
  checked_at: string;
  items: HealthCheckItem[];
};

export type ListHealthChecksResponse = {
  checks: HealthCheck[];
};
