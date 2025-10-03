import { t } from "ttag";

import { useRescanTableFieldValuesMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const RescanTableFieldsButton = ({ tableId }: Props) => {
  const [rescanTableFieldValues] = useRescanTableFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const handleClick = async () => {
    const { error } = await rescanTableFieldValues(tableId);

    if (error) {
      sendErrorToast(t`Failed to start scan`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Scan triggered!` : t`Re-scan table`}
    </Button>
  );
};
