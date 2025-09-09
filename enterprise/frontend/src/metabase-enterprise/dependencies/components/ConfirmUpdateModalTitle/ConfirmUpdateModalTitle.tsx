import { t } from "ttag";

import { Modal } from "metabase/ui";

export function ConfirmUpdateModalTitle() {
  return (
    <Modal.Title>{t`These changes will break some other things. Save anyway?`}</Modal.Title>
  );
}
