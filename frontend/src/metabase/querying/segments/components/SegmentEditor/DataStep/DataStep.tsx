import { useState } from "react";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/Pickers/DataPicker";
import type { TablePickerValue } from "metabase/common/components/Pickers/TablePicker";
import Tables from "metabase/entities/tables";
import { useDispatch, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { TableBreadcrumbs } from "metabase/metadata/components";
import { getMetadata } from "metabase/selectors/metadata";
import { Box, Button, Flex, Icon, Text } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TableId } from "metabase-types/api";

import { ClauseStep } from "../ClauseStep";

type DataStepProps = {
  query: Lib.Query | undefined;
  stageIndex: number;
  isNew: boolean;
  onChange: (query: Lib.Query) => void;
};

export function DataStep({
  query,
  stageIndex,
  isNew,
  onChange,
}: DataStepProps) {
  const [isOpened, setIsOpened] = useState(false);
  const tableId = query ? Lib.sourceTableOrCardId(query) : undefined;
  const table =
    query && tableId ? Lib.tableOrCardMetadata(query, tableId) : undefined;
  const tableInfo =
    query && table ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const tableValue =
    query && table
      ? getDataPickerValue(query, stageIndex, table)
      : { model: "table", id: null };
  const store = useStore();
  const dispatch = useDispatch();

  const handleChange = async (tableId: TableId) => {
    await dispatch(
      Tables.actions.fetchMetadataAndForeignTables({ id: tableId }),
    );
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = Lib.tableOrCardMetadata(metadataProvider, tableId);
    if (table) {
      const newQuery = Lib.queryFromTableOrCardMetadata(
        metadataProvider,
        table,
      );
      onChange(newQuery);
    }
  };

  return (
    <ClauseStep label={t`Data`}>
      <Box>
        {tableId && (
          <Flex maw={300} wrap="nowrap">
            <Text c="text-secondary" size="sm" w="100%">
              <TableBreadcrumbs hideTableName tableId={tableId} />
            </Text>
          </Flex>
        )}

        {isNew ? (
          <Button
            variant="subtle"
            p={0}
            c="text-primary"
            rightSection={<Icon name="chevrondown" />}
            onClick={() => setIsOpened(true)}
          >
            {tableInfo ? tableInfo.displayName : t`Select a table`}
          </Button>
        ) : (
          <Text c="text-primary" fw="bold">
            {tableInfo?.displayName}
          </Text>
        )}
      </Box>

      {isOpened && (
        <DataPickerModal
          title={t`Select a table`}
          models={["table"]}
          value={tableValue as TablePickerValue}
          onChange={handleChange}
          onClose={() => setIsOpened(false)}
          options={{
            showLibrary: false,
            showRootCollection: false,
            showPersonalCollections: false,
          }}
        />
      )}
    </ClauseStep>
  );
}
