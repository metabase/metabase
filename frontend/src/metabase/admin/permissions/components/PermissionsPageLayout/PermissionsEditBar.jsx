import PropTypes from "prop-types";
import { t } from "ttag";
import cx from "classnames";

import Confirm from "metabase/components/Confirm";
import EditBar from "metabase/components/EditBar";
import Button from "metabase/core/components/Button";

import PermissionsConfirm from "../PermissionsConfirm";

const propTypes = {
  onSave: PropTypes.func.isRequired,
  onCancel: PropTypes.func.isRequired,
  shouldConfirmCancel: PropTypes.bool,
  isDirty: PropTypes.bool.isRequired,
  diff: PropTypes.object,
};

export function PermissionsEditBar({
  diff,
  isDirty,
  shouldConfirmCancel,
  onSave,
  onCancel,
}) {
  const saveButton = (
    <Confirm
      title={t`Save permissions?`}
      action={onSave}
      content={diff ? <PermissionsConfirm diff={diff} /> : null}
      triggerClasses={cx({ disabled: !isDirty })}
      key="save"
    >
      <Button primary small>{t`Save changes`}</Button>
    </Confirm>
  );

  const cancelButton = shouldConfirmCancel ? (
    <Confirm
      title={t`Discard changes?`}
      action={onCancel}
      content={t`No changes to permissions will be made.`}
      key="discard"
    >
      <Button small>{t`Cancel`}</Button>
    </Confirm>
  ) : (
    <Button small onClick={onCancel} key="cancel">{t`Cancel`}</Button>
  );

  return (
    <EditBar
      admin
      title={t`You've made changes to permissions.`}
      buttons={[cancelButton, saveButton]}
    />
  );
}

PermissionsEditBar.propTypes = propTypes;
