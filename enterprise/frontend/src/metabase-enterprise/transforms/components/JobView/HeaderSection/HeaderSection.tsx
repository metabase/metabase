import { t } from "ttag";

import { BrowserCrumbs } from "metabase/common/components/BrowserCrumbs";
import * as Urls from "metabase/lib/urls";

import type { TransformJobInfo } from "../types";

type HeaderSectionProps = {
  job: TransformJobInfo;
};

export function HeaderSection({ job }: HeaderSectionProps) {
  return (
    <BrowserCrumbs
      crumbs={[
        {
          title: t`Jobs`,
          to: Urls.transformJobList(),
        },
        {
          title: job.name,
          to: job.id != null ? Urls.transformJob(job.id) : "",
        },
      ]}
    />
  );
}
