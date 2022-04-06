import React from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";

import jobs from "./data";
import { ErrorBox } from "./ModelCacheRefreshJobs.styled";

type Props = {
  params: {
    jobId: string;
  };
  goBack: () => void;
};

function ModelCacheRefreshJobModal({ params, goBack }: Props) {
  const job = jobs.find(j => j.id === Number(params.jobId));
  return (
    <ModalContent
      title={t`Oh oh…`}
      onClose={goBack}
      footer={[
        <Button key="retry" primary>{t`Retry now`}</Button>,
        <Link
          key="edit"
          className="Button"
          to={`/model/${job?.model.id}/query`}
        >{t`Edit model`}</Link>,
      ]}
    >
      <ErrorBox>{job?.error}</ErrorBox>
    </ModalContent>
  );
}

export default ModelCacheRefreshJobModal;
