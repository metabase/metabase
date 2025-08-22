import { t } from "ttag";

import EditableText from "metabase/common/components/EditableText";
import { Stack } from "metabase/ui";

import { NAME_MAX_LENGTH } from "../../constants";

import S from "./NameDescriptionInput.module.css";

type NameDescriptionInputProps = {
  name: string;
  description: string | null;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string | null) => void;
};

export function NameDescriptionInput({
  name,
  description,
  onNameChange,
  onDescriptionChange,
}: NameDescriptionInputProps) {
  const handleDescriptionChange = async (description: string) => {
    onDescriptionChange(description.length === 0 ? null : description);
  };

  return (
    <Stack className={S.section} gap="sm" pb="md">
      <EditableText
        initialValue={name}
        maxLength={NAME_MAX_LENGTH}
        placeholder={t`Name`}
        p={0}
        fw="bold"
        fz="h2"
        lh="h2"
        onChange={onNameChange}
      />
      <EditableText
        initialValue={description ?? ""}
        placeholder={t`No description yet`}
        p={0}
        fz="md"
        lh="1.25rem"
        isOptional
        onChange={handleDescriptionChange}
      />
    </Stack>
  );
}
