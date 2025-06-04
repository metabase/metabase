import { t } from "ttag";

import { useDiscardTableFieldValuesMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useTemporaryState } from "metabase/hooks/use-temporary-state";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const DiscardTableFieldValuesButton = ({ tableId }: Props) => {
  const [discardTableFieldValues] = useDiscardTableFieldValuesMutation();
  const [sendToast] = useToast();
  const [started, setStarted] = useTemporaryState(false, 2000);

  const handleClick = async () => {
    const { error } = await discardTableFieldValues(tableId);

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
