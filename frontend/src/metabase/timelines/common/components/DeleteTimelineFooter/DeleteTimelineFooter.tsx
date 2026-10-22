import { type JSX, useCallback } from "react";
import { t } from "ttag";

import { Button, Modal } from "metabase/ui";
import type { Timeline } from "metabase-types/api";

export interface DeleteTimelineFooterProps {
  timeline: Timeline;
  onSubmit: (timeline: Timeline) => void;
  onSubmitSuccess?: () => void;
  onCancel: () => void;
}

const DeleteTimelineFooter = ({
  timeline,
  onSubmit,
  onSubmitSuccess,
  onCancel,
}: DeleteTimelineFooterProps): JSX.Element => {
  const handleSubmit = useCallback(async () => {
    await onSubmit(timeline);
    onSubmitSuccess?.();
  }, [timeline, onSubmit, onSubmitSuccess]);

  return (
    <Modal.Footer>
      <Button onClick={onCancel}>{t`Cancel`}</Button>
      <Button variant="filled" color="negative" onClick={handleSubmit}>
        {t`Delete`}
      </Button>
    </Modal.Footer>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default DeleteTimelineFooter;
