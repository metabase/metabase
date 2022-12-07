import React, { useCallback } from "react";
import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import { Table, TableVisibilityType } from "metabase-types/api";
import {
  SyncWarningRoot,
  SyncWarningDescription,
  SyncWarningTitle,
} from "./TableSyncWarning.styled";

export interface TableSyncWarningProps {
  onVisibilityTypeChange: (visibilityType: TableVisibilityType) => void;
}

const TableSyncWarning = ({
  onVisibilityTypeChange,
}: TableSyncWarningProps) => {
  const handleVisibilityClick = () => {
    onVisibilityTypeChange(null);
  };

  return (
    <SyncWarningRoot>
      <SyncWarningTitle>
        {t`This table hasn’t been synced yet`}
      </SyncWarningTitle>
      <SyncWarningDescription>
        {t`It was automatically marked as Hidden during the initial sync of this database. Do you want to make it queryable and sync it?`}
      </SyncWarningDescription>
      <Button onClick={handleVisibilityClick}>
        {t`Change to Queryable and sync it`}
      </Button>
    </SyncWarningRoot>
  );
};

export default TableSyncWarning;
