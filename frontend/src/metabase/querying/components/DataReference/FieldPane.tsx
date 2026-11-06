import { t } from "ttag";

import { useGetTableQueryMetadataQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { QueryColumnInfo } from "metabase/common/components/MetadataInfo/QueryColumnInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";

import type { DataReferenceFieldItem, DataReferencePaneProps } from "./types";
import { getTableColumnListInfo } from "./utils";

export const FieldPane = ({
  onBack,
  onClose,
  tableId,
  columnIndex,
}: DataReferencePaneProps<DataReferenceFieldItem>) => {
  const {
    data: table,
    isLoading,
    error,
  } = useGetTableQueryMetadataQuery({ id: tableId });
  const metadataProvider = useMetadataProvider(table?.db_id ?? null);

  if (table == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const columnListInfo = getTableColumnListInfo(metadataProvider, table.id);
  const column = columnListInfo?.columns.at(columnIndex);
  if (columnListInfo == null || column == null) {
    return <LoadingAndErrorWrapper error={t`Failed to load field metadata`} />;
  }

  const { query, stageIndex } = columnListInfo;
  const { name } = Lib.displayInfo(query, stageIndex, column);

  return (
    <SidebarContent title={name} icon="field" onBack={onBack} onClose={onClose}>
      <SidebarContent.Pane>
        <QueryColumnInfo
          query={query}
          stageIndex={stageIndex}
          column={column}
          timezone={table.db?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
};
