import { jt, t } from "ttag";

import { DateTime } from "metabase/common/components/DateTime";
import { Link } from "metabase/common/components/Link";
import type { DataTestRun } from "metabase-types/api";

type DataTestRunTitleProps = {
  run: DataTestRun;
};

export function DataTestRunTitle({ run }: DataTestRunTitleProps) {
  return (
    <span>
      {jt`Run from ${<DateTime key="start" value={run.start_time} unit="minute" />}`}
    </span>
  );
}

type DataTestRunBreadcrumbsOpts = {
  testName: string;
  testUrl: string;
  runsUrl: string;
  run: DataTestRun;
};

export function getDataTestRunBreadcrumbs({
  testName,
  testUrl,
  runsUrl,
  run,
}: DataTestRunBreadcrumbsOpts) {
  return [
    <Link key="test" to={testUrl}>
      {testName}
    </Link>,
    <Link key="runs" to={runsUrl}>{t`Runs`}</Link>,
    <DataTestRunTitle key="run" run={run} />,
  ];
}
