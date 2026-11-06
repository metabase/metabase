import { t } from "ttag";

import {
  useGetCardQuery,
  useGetCardQueryMetadataQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { QueryColumnInfo } from "metabase/common/components/MetadataInfo/QueryColumnInfo";
import { SidebarContent } from "metabase/common/components/SidebarContent";
import { useMetadataProvider } from "metabase/metadata-store";
import * as Lib from "metabase-lib";

import type {
  DataReferenceCardFieldItem,
  DataReferencePaneProps,
  DataReferenceTableFieldItem,
} from "../types";
import { getCardColumnListInfo, getTableColumnListInfo } from "../utils";

type TableFieldPaneProps = DataReferencePaneProps<DataReferenceTableFieldItem>;
type CardFieldPaneProps = DataReferencePaneProps<DataReferenceCardFieldItem>;
type FieldPaneProps = TableFieldPaneProps | CardFieldPaneProps;

export const FieldPane = (props: FieldPaneProps) => {
  switch (props.kind) {
    case "table":
      return <TableFieldPane {...props} />;
    case "card":
      return <CardFieldPane {...props} />;
  }
};

function TableFieldPane({
  tableId,
  columnIndex,
  onBack,
  onClose,
}: TableFieldPaneProps) {
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
  if (columnListInfo == null) {
    return <LoadingAndErrorWrapper error={t`Failed to load field metadata`} />;
  }

  return (
    <ColumnFieldPane
      query={columnListInfo.query}
      stageIndex={columnListInfo.stageIndex}
      columns={columnListInfo.columns}
      columnIndex={columnIndex}
      timezone={table.db?.timezone}
      onBack={onBack}
      onClose={onClose}
    />
  );
}

function CardFieldPane({
  cardId,
  columnIndex,
  onBack,
  onClose,
}: CardFieldPaneProps) {
  const {
    data: card,
    isLoading: isLoadingCard,
    error: cardError,
  } = useGetCardQuery({ id: cardId });
  const {
    data: cardMetadata,
    isLoading: isLoadingCardMetadata,
    error: cardMetadataError,
  } = useGetCardQueryMetadataQuery(cardId);
  const metadataProvider = useMetadataProvider(card?.database_id ?? null);

  if (card == null || cardMetadata == null) {
    return (
      <LoadingAndErrorWrapper
        loading={isLoadingCard || isLoadingCardMetadata}
        error={cardError ?? cardMetadataError}
      />
    );
  }

  const columnListInfo = getCardColumnListInfo(metadataProvider, card.id);
  if (columnListInfo == null) {
    return <LoadingAndErrorWrapper error={t`Failed to load field metadata`} />;
  }

  const database = cardMetadata.databases.find(
    (database) => database.id === card.database_id,
  );

  return (
    <ColumnFieldPane
      query={columnListInfo.query}
      stageIndex={columnListInfo.stageIndex}
      columns={columnListInfo.columns}
      columnIndex={columnIndex}
      timezone={database?.timezone}
      onBack={onBack}
      onClose={onClose}
    />
  );
}

type ColumnFieldPaneProps = {
  query: Lib.Query;
  stageIndex: number;
  columns: Lib.ColumnMetadata[];
  columnIndex: number;
  timezone: string | undefined;
  onBack?: () => void;
  onClose?: () => void;
};

function ColumnFieldPane({
  query,
  stageIndex,
  columns,
  columnIndex,
  timezone,
  onBack,
  onClose,
}: ColumnFieldPaneProps) {
  const column = columns.at(columnIndex);
  if (column == null) {
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
          timezone={timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
}
