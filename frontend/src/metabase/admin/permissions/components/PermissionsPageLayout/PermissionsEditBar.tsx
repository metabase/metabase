import { useDisclosure } from "@mantine/hooks";
import cx from "classnames";
import { t } from "ttag";

import type { PermissionsGraphDiff } from "metabase/admin/permissions/types";
import { Button } from "metabase/common/components/Button";
import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { EditBar } from "metabase/common/components/EditBar";

import { PermissionsConfirm } from "../PermissionsConfirm";

interface PermissionsEditBarProps {
  diff?: PermissionsGraphDiff;
  isDirty: boolean;
  onCancel: () => void;
  onSave?: () => void;
}

export function PermissionsEditBar({
  diff,
  isDirty,
  onCancel,
  onSave,
}: PermissionsEditBarProps) {
  const [modelOpened, { open: openModal, close: closeModal }] = useDisclosure();
  const saveButton = (
    <Button
      key="save"
      onClick={openModal}
      className={cx({ disabled: !isDirty })}
      primary
      small
    >{t`Save changes`}</Button>
  );

  const cancelButton = (
    <Button small onClick={onCancel} key="cancel">{t`Cancel`}</Button>
  );

  return (
    <>
      <EditBar
        admin
        title={t`You've made changes to permissions.`}
        buttons={[cancelButton, saveButton]}
      />
      <ConfirmModal
        title={t`Save permissions?`}
        opened={modelOpened}
        content={diff ? <PermissionsConfirm diff={diff} /> : null}
        onConfirm={() => {
          onSave?.();
          closeModal();
        }}
        onClose={closeModal}
      />
    </>
  );
}
