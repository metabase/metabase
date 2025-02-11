import cx from "classnames";
import { useLayoutEffect, useState } from "react";
import { push, replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import Databases from "metabase/entities/databases";
import Tables from "metabase/entities/tables";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { CreateOrEditCustomModal } from "metabase/notifications/modals/CreateOrEditCustomModal";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Button, Icon } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import { TableSettingsLink } from "./MetadataHeader.styled";

interface OwnProps {
  selectedDatabaseId?: DatabaseId;
  selectedSchemaId?: SchemaId;
  selectedTableId?: TableId;
}

interface TableLoaderProps {
  table?: {
    fields: {
      id: number;
      name: string;
      display_name: string;
    }[];
  };
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

type MetadataHeaderProps = OwnProps &
  DatabaseLoaderProps &
  TableLoaderProps &
  DispatchProps;

const MetadataHeader = ({
  databases,
  selectedDatabaseId,
  selectedSchemaId,
  selectedTableId,
  table,
  onSelectDatabase,
}: MetadataHeaderProps) => {
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState(false);

  useLayoutEffect(() => {
    if (databases.length > 0 && selectedDatabaseId == null) {
      onSelectDatabase(databases[0].id, { useReplace: true });
    }
  }, [databases, selectedDatabaseId, onSelectDatabase]);

  return (
    <div
      data-testid="admin-metadata-header"
      className={cx(
        "MetadataEditor-header",
        CS.flex,
        CS.alignCenter,
        CS.flexNoShrink,
        CS.py4,
      )}
    >
      <Icon
        className={cx(CS.flex, CS.alignCenter, CS.flexNoShrink, CS.textMedium)}
        name="database"
      />
      <div className={cx("MetadataEditor-headerSection", CS.h2)}>
        <DatabaseDataSelector
          databases={databases}
          selectedDatabaseId={selectedDatabaseId}
          setDatabaseFn={onSelectDatabase}
          style={{ padding: 0, paddingLeft: 8 }}
        />
      </div>
      {selectedDatabaseId && selectedSchemaId && selectedTableId && (
        <div
          className={cx(
            "MetadataEditor-headerSection",
            CS.flex,
            CS.flexAlignRight,
            CS.alignCenter,
            CS.flexNoShrink,
          )}
        >
          <span className={cx(CS.ml4, CS.mr3)}>
            <TableSettingsLink
              aria-label={t`Settings`}
              to={Urls.dataModelTableSettings(
                selectedDatabaseId,
                selectedSchemaId,
                selectedTableId,
              )}
            >
              <Icon name="gear" />
            </TableSettingsLink>
            <Button
              variant="subtle"
              aria-label={t`Notifications`}
              onClick={() => setIsNotificationModalOpen(true)}
            >
              <Icon name="bell" className={CS.ml2} />
            </Button>
          </span>
        </div>
      )}

      {isNotificationModalOpen && (
        <CreateOrEditCustomModal
          onClose={() => setIsNotificationModalOpen(false)}
          onNotificationCreated={() => {
            setIsNotificationModalOpen(false);
          }}
          tableId={selectedTableId}
          fields={table?.fields ?? []}
        />
      )}
    </div>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  Tables.load({
    id: (state: any, props: OwnProps) => props.selectedTableId,
  }),
  connect(null, mapDispatchToProps),
)(MetadataHeader);
