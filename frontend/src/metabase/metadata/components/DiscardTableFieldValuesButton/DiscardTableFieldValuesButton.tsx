import { t } from "ttag";

import { useDiscardTableFieldValuesMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const DiscardTableFieldValuesButton = ({ tableId }: Props) => {
  const [discardTableFieldValues] = useDiscardTableFieldValuesMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [started, setStarted] = useTemporaryState(false, 2000);

  const handleClick = async () => {
    const { error } = await discardTableFieldValues(tableId);

    if (error) {
      sendErrorToast(t`Failed to discard values`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button c="error" variant="subtle" onClick={handleClick}>
      {started ? t`Discard triggered!` : t`Discard cached field values`}
    </Button>
  );
};
