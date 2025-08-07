import { useDisclosure } from "@mantine/hooks";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button, Icon } from "metabase/ui";
import type { TransformJob } from "metabase-types/api";

import { SplitSection } from "../../../components/SplitSection";
import { getJobListUrl } from "../../../urls";

import { DeleteJobModal } from "./DeleteJobModal";

export type ManageSectionProps = {
  job: TransformJob;
};

export function ManageSection({ job }: ManageSectionProps) {
  return (
    <SplitSection
      label={t`Manage this job`}
      description={t`Deleting this job won’t delete any transforms.`}
    >
      <DeleteJobButton job={job} />
    </SplitSection>
  );
}

type DeleteJobButtonProps = {
  job: TransformJob;
};

function DeleteJobButton({ job }: DeleteJobButtonProps) {
  const dispatch = useDispatch();
  const [isModalOpened, { open: openModal, close: closeModal }] =
    useDisclosure();
  const { sendSuccessToast } = useMetadataToasts();

  const handleDelete = () => {
    sendSuccessToast(t`Job deleted`);
    dispatch(push(getJobListUrl()));
  };

  return (
    <>
      <Button leftSection={<Icon name="trash" />} onClick={openModal}>
        {t`Delete this job`}
      </Button>
      {isModalOpened && (
        <DeleteJobModal
          job={job}
          onDelete={handleDelete}
          onCancel={closeModal}
        />
      )}
    </>
  );
}
