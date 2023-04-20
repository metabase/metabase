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
  schemaName?: string;
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
  const schemaName = params.schemaName;
  const tableId = Urls.extractEntityId(params.tableId);

  return (
    <div className="p4">
      <MetadataHeader
        selectedDatabaseId={databaseId}
        selectedSchemaName={schemaName}
        selectedTableId={tableId}
      />
      <div
        style={{ minHeight: "60vh" }}
        className="flex flex-row flex-full mt2 full-height"
      >
        {databaseId != null && (
          <MetadataTablePicker
            selectedDatabaseId={databaseId}
            selectedSchemaName={schemaName}
            selectedTableId={tableId}
          />
        )}
        {tableId ? (
          <MetadataTable selectedTableId={tableId} />
        ) : (
          <div style={{ paddingTop: "10rem" }} className="full text-centered">
            <h2 className="text-medium">
              {databases.length === 0
                ? t`The page you asked for couldn't be found.`
                : t`Select any table to see its schema and add or edit metadata.`}
            </h2>
          </div>
        )}
      </div>
    </div>
  );
};

export default Databases.loadList({
  query: {
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  },
})(MetadataEditor);
