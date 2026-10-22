import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { Button, Modal } from "metabase/ui";
import type { TimelineEvent } from "metabase-types/api";

export interface DeleteEventFooterProps {
  event: TimelineEvent;
  onSubmit: (event: TimelineEvent) => void;
  onSubmitSuccess?: () => void;
  onCancel: () => void;
}

const DeleteEventFooter = ({
  event,
  onSubmit,
  onSubmitSuccess,
  onCancel,
}: DeleteEventFooterProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(event);
    onSubmitSuccess?.();
  }, [event, onSubmit, onSubmitSuccess]);

  return (
    <Modal.Footer>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button
        variant="filled"
        color="negative"
        onClick={handleSubmit}
      >{t`Delete`}</Button>
    </Modal.Footer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteEventFooter;
