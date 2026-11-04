import { match } from "ts-pattern";
import { t } from "ttag";
import _ from "underscore";

import type { BadgeColor } from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import * as Urls from "metabase/urls";
import type {
  HealthCheck,
  HealthCheckId,
  HealthCheckItem,
  HealthCheckStatus,
  IconName,
} from "metabase-types/api";

import { compareBySeverity } from "../utils";

import { HEALTH_CHECK_STATUSES } from "./constants";

type StatusStyle = {
  icon: IconName;
  iconColor: ColorName;
  badgeColor: BadgeColor;
};

const STATUS_STYLES: Record<HealthCheckStatus, StatusStyle> = {
  fail: {
    icon: "warning_triangle_filled",
    iconColor: "feedback-negative",
    badgeColor: "negative",
  },
  unknown: { icon: "info", iconColor: "text-secondary", badgeColor: "warning" },
  pass: {
    icon: "check_filled",
    iconColor: "feedback-positive",
    badgeColor: "positive",
  },
};

const getStatusLabel = (status: HealthCheckStatus) =>
  match(status)
    .with("fail", () => t`Failing`)
    .with("unknown", () => t`Couldn't check`)
    .with("pass", () => t`Passed`)
    .exhaustive();

export const getStatusInfo = (status: HealthCheckStatus) => ({
  ...STATUS_STYLES[status],
  label: getStatusLabel(status),
});

export const getChecksByStatus = (
  checks: HealthCheck[],
  status: HealthCheckStatus,
) => checks.filter((check) => check.status === status).sort(compareBySeverity);

export const partitionItemsByProblem = (items: HealthCheckItem[]) =>
  _.partition(
    _.sortBy(items, (item) => HEALTH_CHECK_STATUSES.indexOf(item.status)),
    (item) => item.status !== "pass",
  );

type HealthCheckItemAction = {
  label: string;
  url: string;
};

export const getHealthCheckItemAction = (
  checkId: HealthCheckId,
  item: HealthCheckItem,
): HealthCheckItemAction | null =>
  match({ checkId, item })
    .with(
      { checkId: "read-only-connections", item: { entity_type: "database" } },
      ({ item }) => ({
        label: t`Open database`,
        url: Urls.viewDatabase(item.entity_id),
      }),
    )
    .with(
      { checkId: "all-users-permissions", item: { entity_type: "collection" } },
      ({ item }) => ({
        label: t`Open permissions`,
        url: Urls.collectionPermissions(item.entity_id),
      }),
    )
    .with(
      { checkId: "all-users-permissions", item: { entity_type: "group" } },
      ({ item }) => ({
        label: t`Open permissions`,
        url: Urls.groupDataPermissions(item.entity_id),
      }),
    )
    .otherwise(() => null);

export const getHealthCheckSettingsUrl = (checkId: HealthCheckId) =>
  match(checkId)
    .with("https-site-url", "https-redirect", () => Urls.generalSettings())
    .with("sso-login", "scim-provisioning", "mfa-required", () =>
      Urls.authenticationSettings(),
    )
    .with("supported-version", () => Urls.updatesSettings())
    .otherwise(() => null);
