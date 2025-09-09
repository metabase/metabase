import { t } from "ttag";

import { Modal } from "metabase/ui";

export function ConfirmUpdateModalTitle() {
  return (
    <Modal.Title fz="h3" lh="h3">
      {t`These changes will break some other things. Save anyway?`}
    </Modal.Title>
  );
}
