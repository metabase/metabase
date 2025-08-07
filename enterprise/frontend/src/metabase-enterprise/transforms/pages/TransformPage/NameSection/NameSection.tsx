import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Stack } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { NAME_MAX_LENGTH } from "../../../constants";

import S from "./NameSection.module.css";

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
    <Stack className={S.section} gap="sm" pb="md">
      <EditableText
        initialValue={transform.name}
        maxLength={NAME_MAX_LENGTH}
        placeholder={t`Name`}
        p={0}
        fw="bold"
        fz="h2"
        lh="1.5rem"
        onChange={handleNameChange}
      />
      <EditableText
        initialValue={transform.description ?? ""}
        placeholder={t`No description yet`}
        p={0}
        fz="md"
        lh="1.25rem"
        onChange={handleDescriptionChange}
      />
    </Stack>
  );
}
