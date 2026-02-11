import { t } from "ttag";

import { SchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Group, Radio, Stack, TextInputBlurChange } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { TableId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableMappingInputProps = {
  tag: TemplateTag;
  database?: Database | null;
  databases: Database[];
  onTableChange: (tableId: TableId | undefined) => void;
  onAliasChange: (alias: string | undefined) => void;
};

export function TableMappingInput({
  tag,
  database,
  databases,
  onTableChange,
  onAliasChange,
}: TableMappingInputProps) {
  const tableId = tag["table-id"];
  const alias = tag.alias;
  const type = alias != null ? "alias" : "table-id";
  const hasTableId = tableId != null;
  const hasAlias = alias != null && alias.length > 0;

  const handleChange = (value: string) => {
    onAliasChange(value === "alias" ? "" : undefined);
  };

  const handleAliasChange = (value: string) => {
    const trimmedValue = value.trim();
    onAliasChange(trimmedValue);
  };

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Table to map to`}
          {!hasTableId && !hasAlias && <ErrorSpan>{t`(required)`}</ErrorSpan>}
        </Group>
      </ContainerLabel>

      <Stack gap="sm">
        <Radio.Group value={type} onChange={handleChange}>
          <Stack gap="sm">
            <Radio value="table-id" label={t`Pick the table from the list`} />
            <Radio value="alias" label={t`Enter the schema and table name`} />
          </Stack>
        </Radio.Group>

        {type === "alias" ? (
          <TextInputBlurChange
            value={alias ?? ""}
            placeholder={"MY_SCHEMA.TABLE"}
            autoFocus={!hasAlias}
            data-testid="table-alias-input"
            onBlurChange={(event) => handleAliasChange(event.target.value)}
          />
        ) : (
          <SchemaAndTableDataSelector
            databases={databases}
            selectedDatabase={database || null}
            selectedDatabaseId={database?.id || null}
            selectedTable={tableId}
            selectedTableId={tableId}
            setSourceTableFn={onTableChange}
            isInitiallyOpen={tableId == null}
            isMantine
          />
        )}
      </Stack>
    </InputContainer>
  );
}
