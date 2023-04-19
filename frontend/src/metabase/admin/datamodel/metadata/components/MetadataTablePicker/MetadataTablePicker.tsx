import React from "react";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Schemas from "metabase/entities/schemas";
import { DatabaseId, Schema, TableId } from "metabase-types/api";
import { State } from "metabase-types/store";
import MetadataSchemaList from "../MetadataSchemaList";
import MetadataTableList from "../MetadataTableList";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaName?: string;
  selectedTableId?: TableId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type MetadataTablePickerProps = OwnProps & SchemaLoaderProps;

const MetadataTablePicker = ({
  schemas,
  selectedDatabaseId,
  selectedSchemaName,
  selectedTableId,
}: MetadataTablePickerProps) => {
  if (selectedSchemaName) {
    return (
      <MetadataTableList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaName={selectedSchemaName}
        selectedTableId={selectedTableId}
        canGoBack={schemas.length > 1}
      />
    );
  } else {
    return (
      <MetadataSchemaList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaName={selectedSchemaName}
      />
    );
  }
};

export default Schemas.loadList({
  query: (_: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
})(MetadataTablePicker);
