import { type ReactNode, useState } from "react";

import { BenchLayout } from "metabase/bench/components/BenchLayout";
import * as Urls from "metabase/lib/urls";

import { JobMoreMenuModal } from "../../components/JobMoreMenu";
import type { JobMoreMenuModalState } from "../../types";

import { JobList } from "./JobList";

type JobLayoutParams = {
  jobId?: string;
};

type JobLayoutProps = {
  params: JobLayoutParams;
  children?: ReactNode;
};

export function JobLayout({ params, children }: JobLayoutProps) {
  const selectedJobId = Urls.extractEntityId(params.jobId);
  const [modal, setModal] = useState<JobMoreMenuModalState>();

  return (
    <>
      <BenchLayout
        nav={<JobList selectedId={selectedJobId} onOpenModal={setModal} />}
        name="job"
      >
        {children}
      </BenchLayout>
      {modal != null && (
        <JobMoreMenuModal modal={modal} onClose={() => setModal(undefined)} />
      )}
    </>
  );
}
