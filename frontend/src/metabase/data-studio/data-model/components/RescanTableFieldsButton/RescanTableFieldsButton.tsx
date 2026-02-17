import { t } from "ttag";

import { useRescanTablesFieldValuesMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { trackDataStudioTableFieldsRescanStarted } from "metabase/data-studio/analytics";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

interface Props {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
}

export const RescanTableFieldsButton = ({
  databaseIds,
  schemaIds,
  tableIds,
}: Props) => {
  const [rescanTablesFieldValues] = useRescanTablesFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const isSingleTable =
    (databaseIds == null || databaseIds.length === 0) &&
    (schemaIds == null || schemaIds.length === 0) &&
    tableIds != null &&
    tableIds.length === 1;

  const handleClick = async () => {
    const { error } = await rescanTablesFieldValues({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    });

    if (error) {
      sendErrorToast(t`Failed to start scan`);
      trackDataStudioTableFieldsRescanStarted("failure");
    } else {
      setStarted(true);
      trackDataStudioTableFieldsRescanStarted("success");
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started
        ? t`Scan triggered!`
        : isSingleTable
          ? t`Re-scan table`
          : t`Re-scan tables`}
    </Button>
  );
};
