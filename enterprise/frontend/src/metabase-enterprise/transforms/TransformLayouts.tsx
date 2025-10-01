import type { ReactNode } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";

import { JobList } from "./pages/JobListPage/JobList";
import { TransformList } from "./pages/TransformListPage/TransformList";

type TransformLayoutPropsParams = {
  transformId?: string;
  jobId?: string;
  location?: string;
};

type TransformLayoutProps = {
  params: TransformLayoutPropsParams;
  children?: ReactNode;
};


export function TransformLayout({
  children,
  params,
}: TransformLayoutProps) {
  return (
    <BenchLayout
      nav={<TransformList params={params} />}
      name="transform"
    >
      {children}
    </BenchLayout>
  );
}

export function JobsLayout({
  children,
  params,
}: TransformLayoutProps) {
  return (
    <BenchLayout
      nav={<JobList params={params} />}
      name="job"
    >
      {children}
    </BenchLayout>
  );
}
