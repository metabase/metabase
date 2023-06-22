import { t } from "ttag";
import Button from "metabase/core/components/Button/Button";
import { TableVisibilityType } from "metabase-types/api";
import {
  SyncWarningDescription,
  SyncWarningRoot,
  SyncWarningTitle,
} from "./MetadataTableSyncWarning.styled";

export interface MetadataTableSyncWarningProps {
  onVisibilityTypeChange: (visibility: TableVisibilityType) => void;
}

const MetadataTableSyncWarning = ({
  onVisibilityTypeChange,
}: MetadataTableSyncWarningProps) => {
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MetadataTableSyncWarning;
