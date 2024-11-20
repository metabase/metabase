import { useState } from "react";
import { t } from "ttag";

import {
  DataPickerModal,
  getDataPickerValue,
} from "metabase/common/components/DataPicker";
import { Button } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ClauseStep } from "../ClauseStep";

type DataStepProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

export function DataStep({ query, stageIndex }: DataStepProps) {
  const [isOpened, setIsOpened] = useState(false);
  const tableId = Lib.sourceTableOrCardId(query);
  const table = tableId ? Lib.tableOrCardMetadata(query, tableId) : undefined;
  const tableInfo = table
    ? Lib.displayInfo(query, stageIndex, table)
    : undefined;
  const tableValue = table
    ? getDataPickerValue(query, stageIndex, table)
    : undefined;

  return (
    <ClauseStep label={t`Data`}>
      <Button onClick={() => setIsOpened(true)}>
        {tableInfo ? tableInfo.displayName : t`Select a table`}
      </Button>
      {isOpened && (
        <DataPickerModal
          title={t`Select a table`}
          value={tableValue}
          onChange={() => 0}
          onClose={() => setIsOpened(false)}
        />
      )}
    </ClauseStep>
  );
}
