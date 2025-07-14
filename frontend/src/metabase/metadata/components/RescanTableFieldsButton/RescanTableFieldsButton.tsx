import { t } from "ttag";

import { useRescanTableFieldValuesMutation } from "metabase/api";
import { useTemporaryState, useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const RescanTableFieldsButton = ({ tableId }: Props) => {
  const [rescanTableFieldValues] = useRescanTableFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const [sendToast] = useToast();

  const handleClick = async () => {
    const { error } = await rescanTableFieldValues(tableId);

    if (error) {
      sendToast({
        icon: "warning_triangle_filled",
        iconColor: "var(--mb-color-warning)",
        message: t`Failed to start scan`,
      });
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
