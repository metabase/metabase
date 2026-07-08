import { t } from "ttag";

import {
  type PaneHeaderTab,
  PaneHeaderTabs,
} from "metabase/common/data-studio/components/PaneHeader";
import * as Urls from "metabase/urls";
import type { TransformJobId } from "metabase-types/api";

type JobTabsProps = {
  jobId: TransformJobId;
};

export const JobTabs = ({ jobId }: JobTabsProps) => {
  const tabs = getTabs(jobId);
  return <PaneHeaderTabs tabs={tabs} />;
};

function getTabs(jobId: TransformJobId): PaneHeaderTab[] {
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
