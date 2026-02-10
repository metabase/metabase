import { t } from "ttag";

import { TextInputBlurChange } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableNameInputProps = {
  tag: TemplateTag;
  onChange: (value: string | undefined) => void;
};

export function TableNameInput({ tag, onChange }: TableNameInputProps) {
  const tableName = tag["table-name"];
  const hasTableName = tableName != null;

  const handleChange = (value: string) => {
    const trimmedValue = value.trim();
    onChange(trimmedValue.length === 0 ? undefined : trimmedValue);
  };

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Table name`}
        {!hasTableName && <ErrorSpan ml="xs">({t`required`})</ErrorSpan>}
      </ContainerLabel>
      <TextInputBlurChange
        value={tableName ?? ""}
        placeholder={"MY_TABLE"}
        autoFocus
        data-testid="table-name-input"
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}
