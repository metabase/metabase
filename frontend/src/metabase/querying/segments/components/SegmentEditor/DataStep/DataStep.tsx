import { useState } from "react";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import Tables from "metabase/entities/tables";
import { useDispatch, useStore } from "metabase/lib/redux";
import { checkNotNull } from "metabase/lib/types";
import { getMetadata } from "metabase/selectors/metadata";
import { Button, Icon, Text } from "metabase/ui";
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
    query && table ? getDataPickerValue(query, stageIndex, table) : undefined;
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
    const newQuery = Lib.queryFromTableOrCardMetadata(metadataProvider, table);
    onChange(newQuery);
  };

  return (
    <ClauseStep label={t`Data`}>
      {isNew ? (
        <Button
          variant="subtle"
          p={0}
          c="text-dark"
          rightIcon={<Icon name="chevrondown" />}
          onClick={() => setIsOpened(true)}
        >
          {tableInfo ? tableInfo.displayName : t`Select a table`}
        </Button>
      ) : (
        <Text color="text-dark" weight="bold">
          {tableInfo?.displayName}
        </Text>
      )}
      {isOpened && (
        <DataPickerModal
          title={t`Select a table`}
          models={["table"]}
          value={tableValue}
          onChange={handleChange}
          onClose={() => setIsOpened(false)}
        />
      )}
    </ClauseStep>
  );
}
