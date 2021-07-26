/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import cx from "classnames";
import _ from "underscore";

import Confirm from "metabase/components/Confirm";
import EditBar from "metabase/components/EditBar";
import Button from "metabase/components/Button";
import PermissionsConfirm from "../PermissionsConfirm";

export function PermissionsEditBar({
  onSave,
  diff,
  isDirty,
  confirmCancel,
  onCancel,
}) {
  const saveButton = (
    <Confirm
      title={t`Save permissions?`}
      action={onSave}
      content={<PermissionsConfirm diff={diff} />}
      triggerClasses={cx({ disabled: !isDirty })}
      key="save"
    >
      <Button primary small>{t`Save Changes`}</Button>
    </Confirm>
  );

  const cancelButton = confirmCancel ? (
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
