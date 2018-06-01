import React from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Confirm from "metabase/components/Confirm.jsx";
import PermissionsGrid from "../components/PermissionsGrid.jsx";
import PermissionsConfirm from "../components/PermissionsConfirm.jsx";
import EditBar from "metabase/components/EditBar.jsx";
import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import Button from "metabase/components/Button";
import { t } from "c-3po";
import cx from "classnames";

import _ from "underscore";

const PermissionsEditor = ({
  title = t`Permissions`,
  admin,
  grid,
  onUpdatePermission,
  onSave,
  onCancel,
  confirmCancel,
  isDirty,
  saveError,
  diff,
  location,
}) => {
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
    <LoadingAndErrorWrapper
      loading={!grid}
      className="flex-full flex flex-column"
    >
      {() => (
        <div className="flex-full flex flex-column">
          {isDirty && (
            <EditBar
              admin={admin}
              title={t`You've made changes to permissions.`}
              buttons={[cancelButton, saveButton]}
            />
          )}
          <div className="wrapper pt2">
            {grid && grid.crumbs ? (
              <Breadcrumbs className="py1" crumbs={grid.crumbs} />
            ) : (
              <h2>{title}</h2>
            )}
          </div>
          <PermissionsGrid
            className="flex-full"
            grid={grid}
            onUpdatePermission={onUpdatePermission}
            {...getEntityAndGroupIdFromLocation(location)}
          />
        </div>
      )}
    </LoadingAndErrorWrapper>
  );
};

PermissionsEditor.defaultProps = {
  admin: true,
};

function getEntityAndGroupIdFromLocation({ query = {} } = {}) {
  query = _.mapObject(
    query,
    value => (isNaN(value) ? value : parseFloat(value)),
  );
  const entityId = _.omit(query, "groupId");
  const groupId = query.groupId;
  return {
    groupId: groupId || null,
    entityId: Object.keys(entityId).length > 0 ? entityId : null,
  };
}

export default PermissionsEditor;
