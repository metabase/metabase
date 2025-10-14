import type { Location } from "history";
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
  location: Location;
  children?: ReactNode;
};

export function TransformLayout({
  children,
  params,
  location,
}: TransformLayoutProps) {
  return (
    <BenchLayout
      nav={<TransformList params={params} location={location} />}
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
  return (
    <BenchLayout
      nav={<JobList params={params} location={location} />}
      name="job"
    >
      {children}
    </BenchLayout>
  );
}
