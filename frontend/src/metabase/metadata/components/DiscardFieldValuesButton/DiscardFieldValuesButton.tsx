import { t } from "ttag";

import { useDiscardFieldValuesMutation } from "metabase/api";
import { useTemporaryState } from "metabase/common/hooks";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const DiscardFieldValuesButton = ({ fieldId }: Props) => {
  const [discardFieldValues] = useDiscardFieldValuesMutation();
  const { sendErrorToast } = useMetadataToasts();
  const [started, setStarted] = useTemporaryState(false, 2000);

  const handleClick = async () => {
    const { error } = await discardFieldValues(fieldId);

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
