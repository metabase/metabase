import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import type { TransformJob } from "metabase-types/api";

import { getJobListUrl, getJobUrl } from "../../../urls";

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
