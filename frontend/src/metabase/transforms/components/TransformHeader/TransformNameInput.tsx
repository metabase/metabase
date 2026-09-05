import { t } from "ttag";

import { PaneHeaderInput } from "metabase/common/data-studio/components/PaneHeader";
import { useMetadataToasts } from "metabase/common/hooks";
import { NAME_MAX_LENGTH } from "metabase/transforms/constants";
import type { Transform } from "metabase-types/api";

import { useUpdateTransformMutation } from "../../api/transform";

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
