import { t } from "ttag";

import { Group, TextInputBlurChange } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableAliasInputProps = {
  tag: TemplateTag;
  onAliasChange: (alias: string | undefined) => void;
};

export function TableAliasInput({ tag, onAliasChange }: TableAliasInputProps) {
  const alias = tag.alias;
  const hasAlias = alias != null && alias.length > 0;

  const handleChange = (value: string) => {
    const trimmedValue = value.trim();
    if (trimmedValue.length > 0) {
      onAliasChange(trimmedValue);
    } else {
      onAliasChange(undefined);
    }
  };

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Schema and table name`}
          {!hasAlias && <ErrorSpan>{t`(required)`}</ErrorSpan>}
        </Group>
      </ContainerLabel>
      <TextInputBlurChange
        value={alias ?? ""}
        placeholder={"MY_SCHEMA.TABLE"}
        autoFocus={!hasAlias}
        data-testid="table-alias-input"
        onBlurChange={(event) => handleChange(event.target.value)}
      />
    </InputContainer>
  );
}
