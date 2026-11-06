import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { QueryColumnInfo } from "metabase/common/components/MetadataInfo/QueryColumnInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import * as Lib from "metabase-lib";

import type { DataReferenceFieldItem, DataReferencePaneProps } from "./types";
import { useTableColumns } from "./use-table-columns";

export const FieldPane = ({
  onBack,
  onClose,
  tableId,
  columnIndex,
}: DataReferencePaneProps<DataReferenceFieldItem>) => {
  const { table, queryAndColumns, isLoading, error } = useTableColumns(tableId);

  if (isLoading || error || !queryAndColumns) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const { query, stageIndex, columns } = queryAndColumns;
  const column = columns.at(columnIndex);
  if (!column) {
    return <LoadingAndErrorWrapper error={t`Failed to load field metadata`} />;
  }

  const { name } = Lib.displayInfo(query, stageIndex, column);

  return (
    <SidebarContent title={name} icon="field" onBack={onBack} onClose={onClose}>
      <SidebarContent.Pane>
        <QueryColumnInfo
          query={query}
          stageIndex={stageIndex}
          column={column}
          timezone={table?.db?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
