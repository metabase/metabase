import { useEffect, useRef, useState } from "react";
import { useUnmount } from "react-use";
import { t } from "ttag";

import { useDiscardTableFieldValuesMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Button } from "metabase/ui";
import type { TableId } from "metabase-types/api";

interface Props {
  tableId: TableId;
}

export const DiscardTableFieldValuesButton = ({ tableId }: Props) => {
  const dispatch = useDispatch();

  const [started, setStarted] = useState(false);
  const timeoutIdRef = useRef<number>();
  const [discardTableFieldValues, { error }] =
    useDiscardTableFieldValuesMutation();

  const handleClick = async () => {
    const response = await discardTableFieldValues(tableId);

    if (!response.error) {
      setStarted(true);

      window.clearTimeout(timeoutIdRef.current);
      timeoutIdRef.current = window.setTimeout(() => setStarted(false), 2000);
    }
  };

  useUnmount(() => {
    window.clearTimeout(timeoutIdRef.current);
  });

  useEffect(() => {
    if (error) {
      dispatch(
        addUndo({
          icon: "warning",
          message: t`Failed to discard values`,
          toastColor: "error",
        }),
      );
    }
  }, [dispatch, error]);

  return (
    <Button c="error" variant="subtle" onClick={handleClick}>
      {started ? t`Discard triggered!` : t`Discard cached field values`}
    </Button>
  );
};
