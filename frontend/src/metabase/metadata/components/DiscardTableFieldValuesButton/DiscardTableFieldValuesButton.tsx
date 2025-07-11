import { t } from "ttag";

import { useDiscardTableFieldValuesMutation } from "metabase/api";
import { useTemporaryState, useToast } from "metabase/common/hooks";
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
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to discard values`,
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
