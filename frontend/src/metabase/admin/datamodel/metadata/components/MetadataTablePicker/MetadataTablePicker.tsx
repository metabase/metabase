import Schemas from "metabase/entities/schemas";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import type Schema from "metabase-lib/v1/metadata/Schema";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";
import type { State } from "metabase-types/store";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Schemas.loadList({
  query: (_: State, { selectedDatabaseId }: OwnProps) => ({
    dbId: selectedDatabaseId,
    include_hidden: true,
    ...PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
})(MetadataTablePicker);
