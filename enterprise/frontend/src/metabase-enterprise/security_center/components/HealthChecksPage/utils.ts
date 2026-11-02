import { match } from "ts-pattern";

import * as Urls from "metabase/urls";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
  HealthCheckStatus,
} from "metabase-types/api";

import { compareBySeverity } from "../../utils";

const getChecksByStatus = (
  checks: HealthCheck[],
  status: HealthCheckStatus,
): HealthCheck[] =>
  checks.filter((check) => check.status === status).sort(compareBySeverity);

export const groupHealthChecks = (checks: HealthCheck[]) => ({
  failing: getChecksByStatus(checks, "fail"),
  unknown: getChecksByStatus(checks, "unknown"),
  passed: getChecksByStatus(checks, "pass"),
});

export const splitHealthCheckItems = (items: HealthCheckItem[]) => ({
  problems: [
    ...items.filter((item) => item.status === "fail"),
    ...items.filter((item) => item.status === "unknown"),
  ],
  passed: items.filter((item) => item.status === "pass"),
});

export const getHealthCheckItemUrl = (
  checkId: HealthCheckId,
  item: HealthCheckItem,
): string | null =>
  match({ checkId, item })
    .with(
      { checkId: "read-only-connections", item: { entity_type: "database" } },
      ({ item }) => Urls.viewDatabase(item.entity_id),
    )
    .with(
      { checkId: "all-users-permissions", item: { entity_type: "collection" } },
      ({ item }) => Urls.collectionPermissions(item.entity_id),
    )
    .with(
      { checkId: "all-users-permissions", item: { entity_type: "group" } },
      ({ item }) => Urls.groupDataPermissions(item.entity_id),
    )
    .otherwise(() => null);
