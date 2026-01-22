import { t } from "ttag";

import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import { useDiscardTablesFieldValuesMutation } from "metabase-enterprise/api";
import { trackDataStudioTableFieldValuesDiscardStarted } from "metabase-enterprise/data-studio/analytics";
import type { DatabaseId, SchemaId, TableId } from "metabase-types/api";

interface Props {
  databaseIds?: DatabaseId[];
  schemaIds?: SchemaId[];
  tableIds?: TableId[];
}

export const DiscardTableFieldValuesButton = ({
  databaseIds,
  schemaIds,
  tableIds,
}: Props) => {
  const [discardTablesFieldValues] = useDiscardTablesFieldValuesMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [started, setStarted] = useTemporaryState(false, 2000);

  const handleClick = async () => {
    const { error } = await discardTablesFieldValues({
      database_ids: databaseIds,
      schema_ids: schemaIds,
      table_ids: tableIds,
    });

    if (error) {
      sendErrorToast(t`Failed to discard values`);
      trackDataStudioTableFieldValuesDiscardStarted("failure");
    } else {
      setStarted(true);
      trackDataStudioTableFieldValuesDiscardStarted("success");
    }
  };

  return (
    <Button c="error" variant="subtle" onClick={handleClick}>
      {started ? t`Discard triggered!` : t`Discard cached field values`}
    </Button>
  );
};
