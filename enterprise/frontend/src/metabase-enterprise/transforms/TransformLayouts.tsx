import type { Location } from "history";
import type { PropsWithChildren } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";

import { JobList } from "./pages/JobListPage/JobList";
import { getParsedParams as getJobListParams } from "./pages/JobListPage/utils";
import { TransformList } from "./pages/TransformListPage/TransformList";
import { getParsedParams as getTransformListParams } from "./pages/TransformListPage/utils";

type TransformLayoutPropsParams = {
  transformId?: string;
  jobId?: string;
};

type TransformLayoutProps = PropsWithChildren<{
  params: TransformLayoutPropsParams;
  location: Location;
}>;

export function TransformLayout({
  children,
  params,
  location,
}: TransformLayoutProps) {
  const parsedParams = getTransformListParams(location);
  const selectedId = params.transformId ? +params.transformId : undefined;

  return (
    <BenchLayout
      nav={<TransformList params={parsedParams} selectedId={selectedId} />}
      name="transform"
    >
      {children}
    </BenchLayout>
  );
}

export function JobsLayout({
  children,
  params,
  location,
}: TransformLayoutProps) {
  const parsedParams = getJobListParams(location);
  const selectedId = params.jobId ? +params.jobId : undefined;

  return (
    <BenchLayout
      nav={<JobList params={parsedParams} selectedId={selectedId} />}
      name="job"
    >
      {children}
    </BenchLayout>
  );
}
