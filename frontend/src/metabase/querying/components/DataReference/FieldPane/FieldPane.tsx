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
  ColumnListInfo,
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

  return (
    <ColumnFieldPane
      columnListInfo={getTableColumnListInfo(metadataProvider, table.id)}
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

  const database = cardMetadata.databases.find(
    (database) => database.id === card.database_id,
  );

  return (
    <ColumnFieldPane
      columnListInfo={getCardColumnListInfo(metadataProvider, card.id)}
      columnIndex={columnIndex}
      timezone={database?.timezone}
      onBack={onBack}
      onClose={onClose}
    />
  );
}

type ColumnFieldPaneProps = {
  columnListInfo: ColumnListInfo | undefined;
  columnIndex: number;
  timezone: string | undefined;
  onBack?: () => void;
  onClose?: () => void;
};

function ColumnFieldPane({
  columnListInfo,
  columnIndex,
  timezone,
  onBack,
  onClose,
}: ColumnFieldPaneProps) {
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
          timezone={timezone}
          showAllFieldValues
          showFingerprintInfo
        />
      </SidebarContent.Pane>
    </SidebarContent>
  );
}
