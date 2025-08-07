import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import { getJobListUrl, getJobUrl } from "metabase-enterprise/transforms/urls";
import type { TransformJob } from "metabase-types/api";

type HeaderSectionProps = {
  job: TransformJob;
};

export function HeaderSection({ job }: HeaderSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Jobs`, to: getJobListUrl() },
        { title: job.name, to: getJobUrl(job.id) },
      ]}
    />
  );
}
