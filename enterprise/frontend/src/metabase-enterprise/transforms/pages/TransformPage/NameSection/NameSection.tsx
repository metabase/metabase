import { t } from "ttag";

import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { NameDescriptionInput } from "../../../components/NameDescriptionInput";

type NameSectionProps = {
  transform: Transform;
};

export function NameSection({ transform }: NameSectionProps) {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendErrorToast, sendSuccessToast, sendUndoToast } =
    useMetadataToasts();

  const handleNameChange = async (name: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          name: transform.name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleDescriptionChange = async (description: string | null) => {
    const { error } = await updateTransform({
      id: transform.id,
      description,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform description`);
    } else {
      sendSuccessToast(t`Transform description updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          description: transform.description,
        });
        sendUndoToast(error);
      });
    }
  };

  return (
    <NameDescriptionInput
      name={transform.name}
      description={transform.description}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
    />
  );
}
