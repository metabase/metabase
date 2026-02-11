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
  onTableChange: (tableId: TableId | undefined) => void;
};

export function TableMappingSelect({
  tag,
  database,
  databases,
  onTableChange,
}: TableMappingSelectProps) {
  const tableId = tag["table-id"];
  const hasTableId = tableId != null;

  return (
    <InputContainer>
      <ContainerLabel>
        <Group gap="xs">
          {t`Table to map to`}
          {!hasTableId && <ErrorSpan>{t`(required)`}</ErrorSpan>}
        </Group>
      </ContainerLabel>

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
    </InputContainer>
  );
}
