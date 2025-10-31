import { useListDatabasesQuery } from "metabase/api";
import { ItemsListSection } from "metabase/bench/components/ItemsListSection/ItemsListSection";
import S from "metabase/metadata/pages/DataModel/DataModel.module.css";
import { NoDatabasesEmptyState } from "metabase/metadata/pages/DataModel/components/NoDatabasesEmptyState";
import { RouterTablePicker } from "metabase/metadata/pages/DataModel/components/TablePicker";
import type { RouteParams } from "metabase/metadata/pages/DataModel/types";
import { parseRouteParams } from "metabase/metadata/pages/DataModel/utils";

interface Props {
  params: RouteParams;
}

export const TableOrModelTree = ({ params }: Props) => {
  const { databaseId, schemaName, tableId, collectionId, modelId } =
    parseRouteParams(params);

  const { data: databasesData } = useListDatabasesQuery({
    include_editable_data_model: true,
  });

  return (
    <ItemsListSection
      testId="metadata-items-tree"
      listItems={
        databasesData?.data?.length === 0 ? (
          <NoDatabasesEmptyState />
        ) : (
          <RouterTablePicker
            className={S.tablePicker}
            databaseId={databaseId}
            schemaName={schemaName}
            tableId={tableId}
            collectionId={collectionId}
            modelId={modelId}
            params={params}
          />
        )
      }
    />
  );
};
