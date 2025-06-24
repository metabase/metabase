import { useDisclosure } from "@mantine/hooks";
import { useLayoutEffect } from "react";
import { Link } from "react-router";
import { push, replace } from "react-router-redux";
import { t } from "ttag";
import _ from "underscore";

import Databases from "metabase/entities/databases";
import { connect } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { FieldOrderSidesheet } from "metabase/metadata/components/FieldOrderSidesheet";
import { PLUGIN_FEATURE_LEVEL_PERMISSIONS } from "metabase/plugins";
import { DatabaseDataSelector } from "metabase/query_builder/components/DataSelector";
import { Button, Flex, Icon, Text } from "metabase/ui";
import type Database from "metabase-lib/v1/metadata/Database";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";
import type { Dispatch } from "metabase-types/store";

import S from "./MetadataHeader.module.css";

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
  const [isSidesheetOpen, { close: closeSidesheet, toggle: toggleSidesheet }] =
    useDisclosure();

  useLayoutEffect(() => {
    if (databases.length > 0 && selectedDatabaseId == null) {
      onSelectDatabase(databases[0].id, { useReplace: true });
    }
  }, [databases, selectedDatabaseId, onSelectDatabase]);

  return (
    <Flex align="center" data-testid="admin-metadata-header" flex="1" py="xl">
      <Flex align="center" gap="sm">
        <Text c="text-medium" display="flex" flex="0 0 auto">
          <Icon name="database" />
        </Text>

        <Text fw="bold" size="xl">
          <DatabaseDataSelector
            className={S.databaseDataSelectors}
            databases={databases}
            selectedDatabaseId={selectedDatabaseId}
            setDatabaseFn={onSelectDatabase}
            data-testid="metdata-editor-database-select"
          />
        </Text>
      </Flex>

      {selectedDatabaseId && selectedSchemaId && selectedTableId && (
        <Flex
          align="center"
          flex="1 0 auto"
          gap="md"
          justify="flex-end"
          mx="xl"
        >
          <Button
            aria-label={t`Edit column order`}
            leftSection={<Icon name="sort_arrows" />}
            onClick={toggleSidesheet}
          >{t`Edit column order`}</Button>

          <Button
            aria-label={t`Table settings`}
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

      {selectedTableId && (
        <FieldOrderSidesheet
          isOpen={isSidesheetOpen}
          tableId={selectedTableId}
          onClose={closeSidesheet}
        />
      )}
    </Flex>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  Databases.loadList({
    query: PLUGIN_FEATURE_LEVEL_PERMISSIONS.dataModelQueryProps,
  }),
  connect(null, mapDispatchToProps),
)(MetadataHeader);
