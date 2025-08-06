import { t } from "ttag";

import { NameDescriptionInput } from "metabase/metadata/components";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

type NameSectionProps = {
  transform: Transform;
};

const NAME_MAX_LENGTH = 254;

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

  const handleDescriptionChange = async (description: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      description: description.length === 0 ? null : description,
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
      nameIcon="refresh_downstream"
      nameMaxLength={NAME_MAX_LENGTH}
      namePlaceholder={t`Give this transform a name`}
      description={transform.description ?? ""}
      descriptionPlaceholder={t`Give this transform a description`}
      onNameChange={handleNameChange}
      onDescriptionChange={handleDescriptionChange}
    />
  );
}
