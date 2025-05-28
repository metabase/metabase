import { t } from "ttag";

import { useRescanTableFieldValuesMutation } from "metabase/api";
import { useToast } from "metabase/common/hooks";
import { useTemporaryState } from "metabase/hooks/use-temporary-state";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const RescanTableFieldsButton = ({ tableId }: Props) => {
  const [rescanTableFieldValues] = useRescanTableFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false);
  const [sendToast] = useToast();

  const handleClick = async () => {
    const { error } = await rescanTableFieldValues(tableId);

    if (error) {
      sendToast({
        icon: "warning",
        message: t`Failed to start scan`,
        toastColor: "error",
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
