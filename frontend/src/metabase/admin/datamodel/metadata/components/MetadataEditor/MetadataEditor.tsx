import React from "react";
import { t } from "ttag";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Databases from "metabase/entities/databases";
import { Database, DatabaseId, TableId } from "metabase-types/api";
import MetadataHeader from "../MetadataHeader";
import TablePicker from "../TablePicker";

interface RouteParams {
  databaseId?: DatabaseId;
  schemaName?: string;
  tableId?: TableId;
}

interface RouterProps {
  params: RouteParams;
}

interface DatabaseLoaderProps {
  databases: Database[];
}

type MetadataEditorProps = RouterProps & DatabaseLoaderProps;

const MetadataEditor = ({
  databases,
  params: { databaseId, schemaName, tableId },
}: MetadataEditorProps) => {
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
          <TablePicker
            selectedDatabaseId={databaseId}
            selectedSchemaName={schemaName}
            selectedTableId={tableId}
          />
        )}
        <div style={{ paddingTop: "10rem" }} className="full text-centered">
          <h2 className="text-medium">
            {databases.length === 0
              ? t`The page you asked for couldn't be found.`
              : t`Select any table to see its schema and add or edit metadata.`}
          </h2>
        </div>
      </div>
    </div>
  );
};

export default Databases.loadList({
  query: {
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  },
})(MetadataEditor);
