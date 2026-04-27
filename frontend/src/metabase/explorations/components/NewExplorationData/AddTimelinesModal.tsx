import { t } from "ttag";

import type { Timeline } from "metabase/explorations/types";
import { Modal } from "metabase/ui";

export interface AddTimelinesModalProps {
  opened: boolean;
  onClose: () => void;
  timelines: Timeline[];
  setTimelines: (timelines: Timeline[]) => void;
}

export function AddTimelinesModal({ opened, onClose }: AddTimelinesModalProps) {
  return (
    <Modal title={t`Add timelines`} opened={opened} onClose={onClose}>
      <div>{t`Add timelines`}</div>
    </Modal>
  );
}
