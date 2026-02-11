import { t } from "ttag";

import { SchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Group, Radio, Stack, TextInputBlurChange } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { TableId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

const TYPE_TABLE = "table";
const TYPE_ALIAS = "alias";

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
  const isAlias = alias != null;
  const isEmpty = tableId == null && (alias == null || alias.length === 0);

  const handleTypeChange = (type: string) => {
    onAliasChange(type === TYPE_ALIAS ? "" : undefined);
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
          {isEmpty && <ErrorSpan>{t`(required)`}</ErrorSpan>}
        </Group>
      </ContainerLabel>

      <Stack gap="sm">
        <Radio.Group
          value={isAlias ? TYPE_ALIAS : TYPE_TABLE}
          onChange={handleTypeChange}
        >
          <Stack gap="sm">
            <Radio value={TYPE_TABLE} label={t`Pick the table from the list`} />
            <Radio
              value={TYPE_ALIAS}
              label={t`Enter the schema and the table name`}
            />
          </Stack>
        </Radio.Group>

        {isAlias ? (
          <TextInputBlurChange
            value={alias ?? ""}
            placeholder={"MY_SCHEMA.TABLE"}
            autoFocus={isEmpty}
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
