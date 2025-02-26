import cx from "classnames";
import PropTypes from "prop-types";
import { useState } from "react";
import { t } from "ttag";

import { ConfirmationModal } from "metabase/components/ConfirmationModal";
import EditBar from "metabase/components/EditBar";
import Button from "metabase/core/components/Button";

import PermissionsConfirm from "../PermissionsConfirm";

const propTypes = {
  diff: PropTypes.object,
  isDirty: PropTypes.bool.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
};

export function PermissionsEditBar({ diff, isDirty, onCancel, onSave }) {
  const [saveModalIsOpen, setSaveModalIsOpen] = useState(false);
  const handleOpenSaveModal = () => setSaveModalIsOpen(true);
  const handleCloseSaveModal = () => setSaveModalIsOpen(false);

  const saveButton = (
    <Button
      primary
      small
      onClick={handleOpenSaveModal}
      className={cx({ disabled: !isDirty })}
    >
      {t`Save changes`}
    </Button>
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
      <ConfirmationModal
        key="save"
        opened={saveModalIsOpen}
        title={t`Save permissions?`}
        content={diff ? <PermissionsConfirm diff={diff} /> : null}
        onConfirm={() => {
          onSave();
          handleCloseSaveModal();
        }}
        onClose={handleCloseSaveModal}
      />
    </>
  );
}

PermissionsEditBar.propTypes = propTypes;
