import { t } from "ttag";

import { useRefingerprintFieldMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const RefingerprintFieldButton = ({ fieldId }: Props) => {
  const [refingerprintField] = useRefingerprintFieldMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const { sendErrorToast } = useMetadataToasts();

  const handleClick = async () => {
    const { error } = await refingerprintField(fieldId);

    if (error) {
      sendErrorToast(t`Failed to start fingerprinting`);
    } else {
      setStarted(true);
    }
  };

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Fingerprinting triggered!` : t`Refingerprint field`}
    </Button>
  );
};
