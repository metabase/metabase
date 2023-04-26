import React from "react";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import Schemas from "metabase/entities/schemas";
import { DatabaseId, Schema, SchemaId, TableId } from "metabase-types/api";
import { State } from "metabase-types/store";
import MetadataSchemaList from "../MetadataSchemaList";
import MetadataTableList from "../MetadataTableList";

interface OwnProps {
  selectedDatabaseId: DatabaseId;
  selectedSchemaId?: SchemaId;
  selectedTableId?: TableId;
}

interface SchemaLoaderProps {
  schemas: Schema[];
}

type MetadataTablePickerProps = OwnProps & SchemaLoaderProps;

const MetadataTablePicker = ({
  schemas,
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
}: MetadataTablePickerProps) => {
  if (selectedSchemaId) {
    return (
      <MetadataTableList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaId={selectedSchemaId}
        selectedTableId={selectedTableId}
        canGoBack={schemas.length > 1}
      />
    );
  } else {
    return (
      <MetadataSchemaList
        selectedDatabaseId={selectedDatabaseId}
        selectedSchemaId={selectedSchemaId}
      />
    );
  }
};

export default Schemas.loadList({
  query: (_: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
    include_hidden: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
})(MetadataTablePicker);
