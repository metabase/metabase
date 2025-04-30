import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useRescanTableFieldValuesMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const RescanTableFieldsButton = ({ tableId }: Props) => {
  const dispatch = useDispatch();

  const [started, setStarted] = useState(false);
  const timeoutIdRef = useRef<number>();
  const [rescanTableFieldValues, { error }] =
    useRescanTableFieldValuesMutation();

  const handleClick = async () => {
    const response = await rescanTableFieldValues(tableId);

    if (!response.error) {
      setStarted(true);

      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = window.setTimeout(() => setStarted(false), 2000);
    }
  };

  useEffect(() => {
    if (error) {
      dispatch(
        addUndo({
          icon: "warning",
          message: t`Failed to start scan`,
          toastColor: "error",
        }),
      );
    }
  }, [dispatch, error]);

  return (
    <Button variant="default" onClick={handleClick}>
      {started ? t`Scan triggered!` : t`Re-scan table`}
    </Button>
  );
};
