import { useMemo } from "react";
import { t } from "ttag";

import {
  skipToken,
  useGetCardQueryMetadataQuery,
  useGetFieldQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { QueryColumnInfo } from "metabase/common/components/MetadataInfo/QueryColumnInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { getQueryAndColumns } from "metabase/querying/common/utils";
import { useSelector } from "metabase/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { getQuestionIdFromVirtualTableId } from "metabase-lib/v1/metadata/utils/saved-questions";
import type { FieldId } from "metabase-types/api";

import type {
  DataReferenceFieldItem,
  DataReferencePaneProps,
  UniqueFieldId,
} from "./types";

const STAGE_INDEX = -1;

export const FieldPane = ({
  onBack,
  onClose,
  id,
}: DataReferencePaneProps<DataReferenceFieldItem>) => {
  const { field, table, isLoading, error } = useGetFieldAndTable(id);
  const metadata = useSelector(getMetadata);
  const queryAndColumns = useMemo(
    () =>
      getQueryAndColumns(metadata, table, field !== undefined ? [field] : []),
    [metadata, table, field],
  );

  if (isLoading || error || !field) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  const queryAndColumn = queryAndColumns.get(field);
  if (!queryAndColumn) {
    return <LoadingAndErrorWrapper error={t`Failed to load field metadata`} />;
  }

  return (
    <SidebarContent
      title={field.name}
      icon="field"
      onBack={onBack}
      onClose={onClose}
    >
      <SidebarContent.Pane>
        <QueryColumnInfo
          query={queryAndColumn.query}
          stageIndex={STAGE_INDEX}
          column={queryAndColumn.column}
          timezone={table?.db?.timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
};

function useGetFieldAndTable(id: FieldId | UniqueFieldId) {
  const fromFieldId = useGetFieldAndTableFromFieldId(
    typeof id === "number" ? id : null,
  );

  const fromCardMetadata = useGetVirtualFieldFromCardMetadata(
    typeof id === "string" ? id : null,
  );

  if (typeof id === "number") {
    return fromFieldId;
  } else {
    return fromCardMetadata;
  }
}

function useGetFieldAndTableFromFieldId(id: FieldId | null) {
  const {
    data: field,
    isLoading: isLoadingField,
    error: fieldError,
  } = useGetFieldQuery(id != null ? { id } : skipToken);

  const {
    data: table,
    isLoading: isLoadingTable,
    error: tableError,
  } = useGetTableQueryMetadataQuery(
    field?.table_id != null ? { id: field.table_id } : skipToken,
  );

  return {
    field,
    table,
    isLoading: isLoadingField || isLoadingTable,
    error: fieldError ?? tableError,
  };
}

function useGetVirtualFieldFromCardMetadata(id: UniqueFieldId | null) {
  const virtualTableId = id?.split(":")[0];
  const cardId =
    id != null ? getQuestionIdFromVirtualTableId(virtualTableId) : null;

  const cardMetadata = useGetCardQueryMetadataQuery(
    cardId != null ? cardId : skipToken,
  );

  const virtualTable = cardMetadata.data?.tables.find(
    (table) => table.id === virtualTableId,
  );

  const field = virtualTable?.fields?.find(
    (field) => `${field.table_id}:${field.name}` === id,
  );

  return {
    field,
    table: virtualTable,
    isLoading: cardMetadata.isLoading,
    error: cardMetadata.error,
  };
}
