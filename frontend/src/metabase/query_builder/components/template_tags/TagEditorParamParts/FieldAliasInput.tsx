import { t } from "ttag";

import { TextInputBlurChange } from "metabase/ui";
import type Field from "metabase-lib/v1/metadata/Field";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

type FieldAliasInputProps = {
  tag: TemplateTag;
  field: Field | null;
  onChange: (value: string | undefined) => void;
};

export function FieldAliasInput({
  tag,
  field,
  onChange,
}: FieldAliasInputProps) {
  const handleChange = (value: string) => {
    if (value.length > 0) {
      onChange(value);
    } else {
      onChange(undefined);
    }
  };

  return (
    <InputContainer>
      <ContainerLabel>{t`Field alias`}</ContainerLabel>
      <TextInputBlurChange
        id={`tag-editor-field-alias_${tag.id}`}
        value={tag["alias"]}
        placeholder={field?.name}
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}
