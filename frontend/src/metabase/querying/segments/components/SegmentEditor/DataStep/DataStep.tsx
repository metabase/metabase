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
  const dataSource = query ? Lib.sourceTableOrCardMetadata(query) : null;
  const dataSourceInfo =
    query != null && dataSource != null
      ? Lib.displayInfo(query, stageIndex, dataSource)
      : undefined;
  const pickerValue =
    query != null && dataSource != null
      ? getDataPickerValue(query, stageIndex, dataSource)
      : undefined;
  const store = useStore();
  const dispatch = useDispatch();

  const handleChange = async (tableId: TableId) => {
    await dispatch(
      Tables.actions.fetchMetadataAndForeignTables({ id: tableId }),
    );
    const metadata = getMetadata(store.getState());
    const databaseId = checkNotNull(metadata.table(tableId)).db_id;
    const metadataProvider = Lib.metadataProvider(databaseId, metadata);
    const table = checkNotNull(
      Lib.tableOrCardMetadata(metadataProvider, tableId),
    );
    onChange(Lib.queryFromTableOrCardMetadata(metadataProvider, table));
  };

  return (
    <ClauseStep label={t`Data`}>
      {isNew ? (
        <Button
          variant="subtle"
          p={0}
          c="text-dark"
          rightSection={<Icon name="chevrondown" />}
          onClick={() => setIsOpened(true)}
        >
          {dataSourceInfo ? dataSourceInfo.displayName : t`Select a table`}
        </Button>
      ) : (
        <Text c="text-dark" fw="bold">
          {dataSourceInfo?.displayName}
        </Text>
      )}
      {isOpened && (
        <DataPickerModal
          title={t`Select a table`}
          models={["table"]}
          value={pickerValue}
          onChange={handleChange}
          onClose={() => setIsOpened(false)}
        />
      )}
    </ClauseStep>
  );
}
