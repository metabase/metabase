import { t } from "ttag";

import { useDiscardFieldValuesMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useTemporaryState } from "metabase/hooks/use-temporary-state";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const DiscardFieldValuesButton = ({ fieldId }: Props) => {
  const [discardFieldValues] = useDiscardFieldValuesMutation();
  const [sendToast] = useToast();
  const [started, setStarted] = useTemporaryState(false, 2000);

  const handleClick = async () => {
    const { error } = await discardFieldValues(fieldId);

    if (error) {
      sendToast({
        icon: "warning",
        message: t`Failed to discard values`,
        toastColor: "error",
      });
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
