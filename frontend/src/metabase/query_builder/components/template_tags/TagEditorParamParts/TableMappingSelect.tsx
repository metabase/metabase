import { t } from "ttag";

import { SchemaAndTableDataSelector } from "metabase/query_builder/components/DataSelector";
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

  return (
    <InputContainer>
      <ContainerLabel>
        {t`Table to map to`}
        {tableId == null && <ErrorSpan ml="xs">({t`required`})</ErrorSpan>}
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
