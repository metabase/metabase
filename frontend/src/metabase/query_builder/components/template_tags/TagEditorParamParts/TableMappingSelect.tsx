import { t } from "ttag";

import { SchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
import { Group } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { TableId, TemplateTag } from "metabase-types/api";

import { ContainerLabel, ErrorSpan, InputContainer } from "./TagEditorParam";

type TableMappingSelectProps = {
  tag: TemplateTag;
  database?: Database | null;
  databases: Database[];
  onChange: (tableId: TableId) => void;
};

export function TableMappingSelect({
  tag,
  database,
  databases,
  onChange,
}: TableMappingSelectProps) {
  const tableId = tag["table-id"];
  const isEmpty = tableId == null;

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Table to map to`}
          {isEmpty && <ErrorSpan>{t`(required)`}</ErrorSpan>}
        </Group>
      </ContainerLabel>
      <SchemaAndTableDataSelector
        databases={databases}
        selectedDatabase={database || null}
        selectedDatabaseId={database?.id || null}
        selectedTable={tableId}
        selectedTableId={tableId}
        setSourceTableFn={onChange}
        isInitiallyOpen={tableId == null}
        isMantine
      />
    </InputContainer>
  );
}
