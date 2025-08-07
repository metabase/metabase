import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { getJobListUrl, getJobUrl } from "metabase-enterprise/transforms/urls";
import type { TransformJob } from "metabase-types/api";

type BreadcrumbsSectionProps = {
  job: TransformJob;
};

export function BreadcrumbsSection({ job }: BreadcrumbsSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Jobs`, to: getJobListUrl() },
        { title: job.name, to: getJobUrl(job.id) },
      ]}
    />
  );
}
