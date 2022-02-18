import React, { useEffect } from "react";
import { Link, withRouter } from "react-router";
import { t } from "ttag";
import _ from "underscore";
import { Location } from "history";

import Databases from "metabase/entities/databases";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import SaveStatus from "metabase/components/SaveStatus";
import Toggle from "metabase/core/components/Toggle";
import Icon from "metabase/components/Icon";

interface MetadataHeaderProps {
  databaseId: number;
  databases: any[];
  selectDatabase: (database: any, shouldReplace?: boolean) => void;
  isShowingSchema: boolean;
  toggleShowSchema: (value: boolean) => void;
  location: Location;
}

export const MetadataHeader = ({
  databaseId,
  databases,
  selectDatabase,
  isShowingSchema,
  toggleShowSchema,
  location,
}: MetadataHeaderProps) => {
  useEffect(() => {
    if (databaseId === undefined && databases.length > 0) {
      selectDatabase(databases[0], isShowingSchema);
    }
  }, [databaseId, databases, isShowingSchema, selectDatabase]);

  const isViewingTable = location.pathname.match(/table\/\d+\/?$/);
  return (
    <div className="MetadataEditor-header flex align-center flex-no-shrink pb2">
      <Icon
        className="flex align-center flex-no-shrink text-medium"
        name="database"
      />
      <div className="MetadataEditor-headerSection h2">
        <DatabaseDataSelector
          databases={databases}
          selectedDatabaseId={databaseId}
          setDatabaseFn={(id: number) => selectDatabase({ id })}
          style={{ padding: 0, paddingLeft: 8 }}
        />
      </div>
      <div className="MetadataEditor-headerSection flex flex-align-right align-center flex-no-shrink">
        <SaveStatus />
        <div className="mr1 text-medium">{t`Show original schema`}</div>
        <Toggle value={isShowingSchema} onChange={toggleShowSchema} />

        {isViewingTable && (
          <span className="ml4 mr3">
            <Link to={`${location.pathname}/settings`}>
              <Icon name="gear" className="text-brand-hover" />
            </Link>
          </span>
        )}
      </div>
    </div>
  );
};

export default _.compose(
  withRouter,
  Databases.loadList({ selectorName: "getDataModelDatabases" }),
)(MetadataHeader);
