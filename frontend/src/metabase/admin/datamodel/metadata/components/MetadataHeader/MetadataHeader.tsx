import cx from "classnames";
import { useLayoutEffect } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Button, Flex, Icon } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

interface OwnProps {
  selectedDatabaseId?: DatabaseId;
  selectedSchemaId?: SchemaId;
  selectedTableId?: TableId;
}

interface DatabaseLoaderProps {
  databases: Database[];
}

interface DispatchProps {
  onSelectDatabase: (
    databaseId: DatabaseId,
    options: { useReplace?: boolean },
  ) => void;
}

const mapDispatchToProps = (dispatch: Dispatch): DispatchProps => ({
  // When navigating programatically, use replace so that the browser back button works
  onSelectDatabase: (databaseId, { useReplace = false } = {}) =>
    dispatch(
      useReplace
        ? replace(Urls.dataModelDatabase(databaseId))
        : push(Urls.dataModelDatabase(databaseId)),
    ),
});

type MetadataHeaderProps = OwnProps & DatabaseLoaderProps & DispatchProps;

const MetadataHeader = ({
  databases,
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
  onSelectDatabase,
}: MetadataHeaderProps) => {
  useLayoutEffect(() => {
    if (databases.length > 0 && selectedDatabaseId == null) {
      onSelectDatabase(databases[0].id, { useReplace: true });
    }
  }, [databases, selectedDatabaseId, onSelectDatabase]);

  return (
    <div
      data-testid="admin-metadata-header"
      className={cx(CS.flex, CS.alignCenter, CS.flexNoShrink, CS.py4)}
    >
      <Icon
        className={cx(CS.flex, CS.alignCenter, CS.flexNoShrink, CS.textMedium)}
        name="database"
      />
      <div className={CS.h2}>
        <DatabaseDataSelector
          databases={databases}
          selectedDatabaseId={selectedDatabaseId}
          setDatabaseFn={onSelectDatabase}
          style={{ padding: 0, paddingLeft: 8 }}
        />
      </div>

      {selectedDatabaseId && selectedSchemaId && selectedTableId && (
        <Flex align="center" justify="flex-end" flex="1 0 auto" mx="xl">
          <Button
            component={Link}
            leftSection={<Icon name="gear" />}
            to={Urls.dataModelTableSettings(
              selectedDatabaseId,
              selectedSchemaId,
              selectedTableId,
            )}
          >{t`Table settings`}</Button>
        </Flex>
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  connect(null, mapDispatchToProps),
)(MetadataHeader);
