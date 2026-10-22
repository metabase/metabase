import { t } from "ttag";

import {
  type PillTab,
  PillTabNavigation,
} from "metabase/common/components/PillTabNavigation";
import * as Urls from "metabase/urls";
import type { TransformJobId } from "metabase-types/api";

type JobTabsProps = {
  jobId: TransformJobId;
};

export const JobTabs = ({ jobId }: JobTabsProps) => {
  const tabs = getTabs(jobId);
  return <PillTabNavigation tabs={tabs} />;
};

function getTabs(jobId: TransformJobId): PillTab[] {
  return [
    {
      label: t`Overview`,
      to: Urls.transformJob(jobId),
    },
    {
      label: t`Run history`,
      to: Urls.transformJobRuns(jobId),
    },
  ];
}
