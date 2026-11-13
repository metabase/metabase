import { c, msgid, t } from "ttag";

import { Alert, Icon } from "metabase/ui";
import type { HealthCheck } from "metabase-types/api";

import { getStatusInfo } from "../utils";

type HealthChecksSummaryProps = {
  checks: HealthCheck[];
};

export const HealthChecksSummary = ({ checks }: HealthChecksSummaryProps) => {
  const passedCount = checks.filter((check) => check.status === "pass").length;
  const isAllClear = passedCount === checks.length;
  const isFailing = checks.some((check) => check.status === "fail");

  if (isAllClear) {
    const { icon } = getStatusInfo("pass");

    return (
      <Alert
        variant="default"
        size="compact"
        color="success"
        icon={<Icon name={icon} />}
        title={t`All security checks pass`}
      />
    );
  }

  const { icon } = getStatusInfo(isFailing ? "fail" : "unknown");
  const totalCount = checks.length;
  const summary = c(
    "{0} is the number of passing checks, {1} is the total number of checks",
  ).ngettext(
    msgid`${passedCount} of ${totalCount} checks passes`,
    `${passedCount} of ${totalCount} checks pass`,
    passedCount,
  );

  return (
    <Alert
      variant="default"
      size="compact"
      color={isFailing ? "error" : "warning"}
      icon={<Icon name={icon} />}
      title={summary}
    />
  );
};
