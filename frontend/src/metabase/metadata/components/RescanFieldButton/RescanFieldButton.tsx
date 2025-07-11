import { t } from "ttag";

import { useRescanFieldValuesMutation } from "metabase/api";
import { useTemporaryState, useToast } from "metabase/common/hooks";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const RescanFieldButton = ({ fieldId }: Props) => {
  const [rescanFieldValues] = useRescanFieldValuesMutation();
  const [started, setStarted] = useTemporaryState(false, 2000);
  const [sendToast] = useToast();

  const handleClick = async () => {
    const { error } = await rescanFieldValues(fieldId);

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
      {started ? t`Scan triggered!` : t`Re-scan field`}
    </Button>
  );
};
