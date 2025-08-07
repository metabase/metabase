import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateTransformJobMutation } from "metabase-enterprise/api";
import type { TransformJob } from "metabase-types/api";

import { NameDescriptionInput } from "../../../components/NameDescriptionInput";

type NameSectionProps = {
  job: TransformJob;
};

export function NameSection({ job }: NameSectionProps) {
  const [updateJob] = useUpdateTransformJobMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
    const { error } = await updateJob({
      id: job.id,
      name,
    });

    if (error) {
      sendErrorToast(t`Failed to update job name`);
    } else {
      sendSuccessToast(t`Job name updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          name: job.name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string | null) => {
    const { error } = await updateJob({
      id: job.id,
      description,
    });

    if (error) {
      sendErrorToast(t`Failed to update job description`);
    } else {
      sendSuccessToast(t`Job description updated`, async () => {
        const { error } = await updateJob({
          id: job.id,
          description: job.description,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <NameDescriptionInput
      name={job.name}
      description={job.description}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
    />
  );
}
