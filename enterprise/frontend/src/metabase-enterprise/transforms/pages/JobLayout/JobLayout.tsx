import type { ReactNode } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";
import * as Urls from "metabase/lib/urls";

import { JobList } from "./JobList";

type JobLayoutParams = {
  jobId?: string;
};

type JobLayoutProps = {
  params: JobLayoutParams;
  children?: ReactNode;
};

export function JobLayout({ params, children }: JobLayoutProps) {
  const selectedId = Urls.extractEntityId(params.jobId);

  return (
    <BenchLayout nav={<JobList selectedId={selectedId} />} name="job">
      {children}
    </BenchLayout>
  );
}
