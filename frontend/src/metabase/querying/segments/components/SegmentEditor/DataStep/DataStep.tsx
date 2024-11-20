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
  query: Lib.Query | undefined;
  stageIndex: number;
  onChange: (query: Lib.Query) => void;
};

export function DataStep({ query, stageIndex }: DataStepProps) {
  const [isOpened, setIsOpened] = useState(false);
  const tableId = query ? Lib.sourceTableOrCardId(query) : undefined;
  const table =
    query && tableId ? Lib.tableOrCardMetadata(query, tableId) : undefined;
  const tableInfo =
    query && table ? Lib.displayInfo(query, stageIndex, table) : undefined;
  const tableValue =
    query && table ? getDataPickerValue(query, stageIndex, table) : undefined;

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
