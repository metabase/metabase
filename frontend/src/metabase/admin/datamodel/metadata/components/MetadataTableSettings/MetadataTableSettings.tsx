import React, { useCallback } from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import ActionButton from "metabase/components/ActionButton";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import { Database, Schema, Table, TableId } from "metabase-types/api";
import MetadataSection from "../MetadataSection";
import MetadataSectionHeader from "../MetadataSectionHeader";
import MetadataBackButton from "../MetadataBackButton";

interface RouteParams {
  databaseId: string;
  schemaName: string;
  tableId: string;
}

interface RouterProps {
  params: RouteParams;
}

interface DatabaseLoaderProps {
  database: Database;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

interface TableLoaderProps {
  table: Table;
}

interface DispatchProps {
  onRescanFieldValues: (tableId: TableId) => void;
  onDiscardFieldValues: (tableId: TableId) => void;
}

type MetadataTableSettingsProps = RouterProps &
  DatabaseLoaderProps &
  SchemaLoaderProps &
  TableLoaderProps &
  DispatchProps;

const MetadataTableSettings = ({
  database,
  schemas,
  table,
  params: { schemaName },
  onRescanFieldValues,
  onDiscardFieldValues,
}: MetadataTableSettingsProps) => {
  const handleRescanFieldValues = useCallback(() => {
    onRescanFieldValues(table.id);
  }, [table, onRescanFieldValues]);

  const handleDiscardFieldvalues = useCallback(() => {
    onDiscardFieldValues(table.id);
  }, [table, onDiscardFieldValues]);

  return (
    <div className="relative">
      <div className="wrapper wrapper--trim">
        <div className="flex align-center my2">
          <MetadataBackButton
            selectedDatabaseId={database.id}
            selectedSchemaName={schemaName}
            selectedTableId={table.id}
          />
          <div className="my4 py1 ml2">
            <Breadcrumbs
              crumbs={[
                [database.name, Urls.dataModelDatabase(database.id)],
                schemas.length > 1 && [
                  schemaName,
                  Urls.dataModelSchema(database.id, schemaName),
                ],
                [
                  table.display_name,
                  Urls.dataModelTable(database.id, schemaName, table.id),
                ],
                t`Settings`,
              ]}
            />
          </div>
        </div>
        <MetadataSection>
          <MetadataSectionHeader
            title={t`Cached field values`}
            description={t`Metabase can scan the values in this table to enable checkbox filters in dashboards and questions.`}
          />
          <ActionButton
            className="Button mr2"
            actionFn={handleRescanFieldValues}
            normalText={t`Re-scan this table`}
            activeText={t`Starting…`}
            failedText={t`Failed to start scan`}
            successText={t`Scan triggered!`}
          />
          <ActionButton
            className="Button Button--danger"
            actionFn={handleDiscardFieldvalues}
            normalText={t`Discard cached field values`}
            activeText={t`Starting…`}
            failedText={t`Failed to discard values`}
            successText={t`Discard triggered!`}
          />
        </MetadataSection>
      </div>
    </div>
  );
};

export default MetadataTableSettings;
