import { useEffect, useRef, useState } from "react";
import { t } from "ttag";

import { useDiscardFieldValuesMutation } from "metabase/api";
import { useDispatch } from "metabase/lib/redux";
import { addUndo } from "metabase/redux/undo";
import { Button } from "metabase/ui";
import type { FieldId } from "metabase-types/api";

interface Props {
  fieldId: FieldId;
}

export const DiscardFieldValuesButton = ({ fieldId }: Props) => {
  const dispatch = useDispatch();

  const [started, setStarted] = useState(false);
  const timeoutIdRef = useRef<number>();
  const [discardFieldValues, { error }] = useDiscardFieldValuesMutation();

  const handleClick = async () => {
    const response = await discardFieldValues(fieldId);

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
