import { t } from "ttag";

import { useRefingerprintTableMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const RefingerprintTableButton = ({ tableId }: Props) => {
  const [refingerprintTable] = useRefingerprintTableMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const handleClick = async () => {
    const { error } = await refingerprintTable(tableId);

    if (error) {
      sendErrorToast(t`Failed to start fingerprinting`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Fingerprinting triggered!` : t`Refingerprint table`}
    </Button>
  );
};
