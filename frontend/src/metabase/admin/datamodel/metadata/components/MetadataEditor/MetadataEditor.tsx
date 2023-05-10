import React from "react";
import { t } from "ttag";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Databases from "metabase/entities/databases";
import Database from "metabase-lib/metadata/Database";
import MetadataHeader from "../MetadataHeader";
import MetadataTable from "../MetadataTable";
import MetadataTablePicker from "../MetadataTablePicker";

interface RouteParams {
  databaseId?: string;
  schemaId?: string;
  tableId?: string;
}

interface RouterProps {
  params: RouteParams;
}

interface DatabaseLoaderProps {
  databases: Database[];
}

type MetadataEditorProps = RouterProps & DatabaseLoaderProps;

const MetadataEditor = ({ databases, params }: MetadataEditorProps) => {
  const databaseId = Urls.extractEntityId(params.databaseId);
  const schemaId = params.schemaId;
  const tableId = Urls.extractEntityId(params.tableId);
  const hasDatabaseId = databaseId != null;
  const hasSchemaId = schemaId != null;
  const hasTableId = tableId != null;
  const hasDatabases = databases.length !== 0;

  return (
    <div className="p4">
      <MetadataHeader
        selectedDatabaseId={databaseId}
        selectedSchemaId={schemaId}
        selectedTableId={tableId}
      />
      <div
        style={{ minHeight: "60vh" }}
        className="flex flex-row flex-full mt2 full-height"
      >
        {hasDatabaseId && (
          <MetadataTablePicker
            selectedDatabaseId={databaseId}
            selectedSchemaId={schemaId}
            selectedTableId={tableId}
          />
        )}
        {hasDatabaseId && hasSchemaId && hasTableId ? (
          <MetadataTable
            selectedDatabaseId={databaseId}
            selectedSchemaId={schemaId}
            selectedTableId={tableId}
          />
        ) : (
          <div style={{ paddingTop: "10rem" }} className="full text-centered">
            <h2 className="text-medium">
              {hasDatabases
                ? t`Select any table to see its schema and add or edit metadata.`
                : t`The page you asked for couldn't be found.`}
            </h2>
          </div>
        )}
      </div>
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Databases.loadList({
  query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
})(MetadataEditor);
