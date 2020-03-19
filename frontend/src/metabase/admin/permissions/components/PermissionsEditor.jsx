import React from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import Confirm from "metabase/components/Confirm";
import PermissionsGrid from "../components/PermissionsGrid";
import PermissionsConfirm from "../components/PermissionsConfirm";
import PermissionsTabs from "../components/PermissionsTabs";
import EditBar from "metabase/components/EditBar";
import Breadcrumbs from "metabase/components/Breadcrumbs";
import Button from "metabase/components/Button";
import { t } from "ttag";
import cx from "classnames";

import _ from "underscore";

const PermissionsEditor = ({
  tab,
  admin,
  grid,
  onUpdatePermission,
  onSave,
  onCancel,
  onChangeTab,
  confirmCancel,
  isDirty,
  diff,
  location,
  children,
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
          {tab && (
            <div className="border-bottom mb3">
              <PermissionsTabs tab={tab} onChangeTab={onChangeTab} />
            </div>
          )}
          {grid && grid.crumbs && grid.crumbs.length > 0 ? (
            <div className="px2 pb1 ml3">
              <Breadcrumbs className="py1" crumbs={grid.crumbs} />
            </div>
          ) : null}
          {children}
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
  query = _.mapObject(query, value =>
    isNaN(value) ? value : parseFloat(value),
  );
  const entityId = _.omit(query, "groupId");
  const groupId = query.groupId;
  return {
    groupId: groupId || null,
    entityId: Object.keys(entityId).length > 0 ? entityId : null,
  };
}

export default PermissionsEditor;
