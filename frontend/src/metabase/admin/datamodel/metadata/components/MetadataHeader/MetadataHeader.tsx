import React from "react";
import { Link } from "react-router";
import * as Urls from "metabase/lib/urls";
import Icon from "metabase/components/Icon/Icon";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Database, DatabaseId, TableId } from "metabase-types/api";

export interface MetadataHeaderProps {
  databases: Database[];
  selectedDatabaseId: DatabaseId;
  selectedSchemaName?: string;
  selectedTableId?: TableId;
  onSelectDatabase: (databaseId: DatabaseId) => void;
}

const MetadataHeader = ({
  databases,
  selectedDatabaseId,
  selectedSchemaName,
  selectedTableId,
  onSelectDatabase,
}: MetadataHeaderProps) => {
  return (
    <div className="MetadataEditor-header flex align-center flex-no-shrink pb2">
      <Icon
        className="flex align-center flex-no-shrink text-medium"
        name="database"
      />
      <div className="MetadataEditor-headerSection h2">
        <DatabaseDataSelector
          databases={databases}
          selectedDatabaseId={selectedDatabaseId}
          setDatabaseFn={onSelectDatabase}
          style={{ padding: 0, paddingLeft: 8 }}
        />
      </div>
      <div className="MetadataEditor-headerSection flex flex-align-right align-center flex-no-shrink">
        {selectedSchemaName != null && selectedTableId != null && (
          <span className="ml4 mr3">
            <Link
              to={Urls.dataModelTableSettings(
                selectedDatabaseId,
                selectedSchemaName,
                selectedTableId,
              )}
            >
              <Icon name="gear" className="text-brand-hover" />
            </Link>
          </span>
        )}
      </div>
    </div>
  );
};

export default MetadataHeader;
