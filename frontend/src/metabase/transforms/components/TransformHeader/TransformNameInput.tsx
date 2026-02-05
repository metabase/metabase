import { t } from "ttag";

import { useUpdateTransformMutation } from "metabase/api";
import { PaneHeaderInput } from "metabase/data-studio/common/components/PaneHeader";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { NAME_MAX_LENGTH } from "metabase/transforms/constants";
import type { Transform } from "metabase-types/api";

type TransformNameInputProps = {
  transform: Transform;
  readOnly?: boolean;
};

export const TransformNameInput = ({
  transform,
  readOnly,
}: TransformNameInputProps) => {
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const handleChangeName = async (newName: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`);
    }
  };

  return (
    <PaneHeaderInput
      initialValue={transform.name}
      maxLength={NAME_MAX_LENGTH}
      onChange={handleChangeName}
      readOnly={readOnly}
    />
  );
};
