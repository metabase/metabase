import { t } from "ttag";

import { TextInputBlurChange } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableSchemaInputProps = {
  tag: TemplateTag;
  onChange: (value: string | undefined) => void;
};

export function TableSchemaInput({ tag, onChange }: TableSchemaInputProps) {
  const tableSchema = tag["table-schema"];
  const hasTableSchema = tableSchema == null;

  const handleChange = (value: string) => {
    const trimmedValue = value.trim();
    onChange(trimmedValue.length === 0 ? undefined : trimmedValue);
  };

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Table schema`}
        {!hasTableSchema && <ErrorSpan ml="xs">({t`required`})</ErrorSpan>}
      </ContainerLabel>
      <TextInputBlurChange
        value={tableSchema ?? ""}
        placeholder={"public"}
        data-testid="table-schema-input"
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}
