import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";

import { getJobListUrl, getJobUrl } from "../../../urls";
import type { TransformJobInfo } from "../types";

type HeaderSectionProps = {
  job: TransformJobInfo;
};

export function HeaderSection({ job }: HeaderSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        { title: t`Jobs`, to: getJobListUrl() },
        { title: job.name, to: job.id != null ? getJobUrl(job.id) : "" },
      ]}
    />
  );
}
