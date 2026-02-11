import { t } from "ttag";

import { Radio, Stack } from "metabase/ui";
import type { TemplateTag } from "metabase-types/api";

import { ContainerLabel, InputContainer } from "./TagEditorParam";

type TableMappingTypeInputProps = {
  tag: TemplateTag;
  onAliasChange: (alias: string | undefined) => void;
};

export function TableMappingTypeInput({
  tag,
  onAliasChange,
}: TableMappingTypeInputProps) {
  const type = tag.alias != null ? "alias" : "table-id";

  const handleChange = (value: string) => {
    onAliasChange(value === "alias" ? "" : undefined);
  };

  return (
    <InputContainer>
      <ContainerLabel>{t`Table mapping type`}</ContainerLabel>
      <Radio.Group value={type} onChange={handleChange}>
        <Stack gap="sm">
          <Radio value="table-id" label={t`Pick the table from the list`} />
          <Radio value="alias" label={t`Enter the schema and table name`} />
        </Stack>
      </Radio.Group>
    </InputContainer>
  );
}
