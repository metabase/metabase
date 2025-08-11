import { t } from "ttag";

import { useRescanFieldValuesMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const RescanFieldButton = ({ fieldId }: Props) => {
  const [rescanFieldValues] = useRescanFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const handleClick = async () => {
    const { error } = await rescanFieldValues(fieldId);

    if (error) {
      sendErrorToast(t`Failed to start scan`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Scan triggered!` : t`Re-scan field`}
    </Button>
  );
};
