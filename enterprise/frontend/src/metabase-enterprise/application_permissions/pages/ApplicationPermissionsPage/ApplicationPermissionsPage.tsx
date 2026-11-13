/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call -- FIXME: any-typed values */
import { useCallback, useEffect } from "react";

import { PermissionsEditor } from "metabase/admin/permissions/components/PermissionsEditor";
import { PermissionsPageLayout } from "metabase/admin/permissions/components/PermissionsPageLayout";
import { getPermissionsBasePath } from "metabase/common/components/PermissionsBasePath/base-path";
import {
  ApplicationPermissionsHelp,
  type EntityView,
  EntityViewSwitch,
} from "metabase/permissions";
import { connect } from "metabase/redux";
import { useNavigate } from "metabase/router";
import { Box } from "metabase/ui";
import {
  initializeApplicationPermissions,
  saveApplicationPermissions,
  updateApplicationPermission,
} from "metabase-enterprise/application_permissions/reducer";
import {
  getApplicationPermissionEditor,
  getIsDirty,
} from "metabase-enterprise/application_permissions/selectors";
import type { ApplicationPermissionsState } from "metabase-enterprise/application_permissions/types/state";
import type { GroupId } from "metabase-types/api";

const mapDispatchToProps = {
  initialize: initializeApplicationPermissions,
  updatePermission: updateApplicationPermission,
  savePermissions: saveApplicationPermissions,
};

const mapStateToProps = (state: ApplicationPermissionsState) => {
  return {
    permissionEditor: getApplicationPermissionEditor(state),
    isDirty: getIsDirty(state),
  };
};

type ApplicationPermissionsValue = "yes" | "no";

interface ApplicationPermissionsPageProps {
  isDirty: boolean;
  permissionEditor: any;
  initialize: () => void;
  savePermissions: () => void;
  updatePermission: any;
}

const ApplicationPermissionsPage = ({
  permissionEditor,
  isDirty,
  initialize,
  savePermissions,
  updatePermission,
}: ApplicationPermissionsPageProps) => {
  useEffect(() => {
    initialize();
  }, [initialize]);

  const handlePermissionChange = useCallback(
    (
      item: { id: GroupId },
      permission: any,
      value: ApplicationPermissionsValue,
    ) => {
      updatePermission({
        groupId: item.id,
        permission,
        value,
      });
    },
    [updatePermission],
  );
  return (
    <PermissionsPageLayout
      tab="application"
      isDirty={isDirty}
      helpContent={<ApplicationPermissionsHelp />}
      onSave={savePermissions}
      onLoad={() => initialize()}
    >
      {permissionEditor && (
        <PermissionsEditor
          {...permissionEditor}
          onChange={handlePermissionChange}
          preHeaderContent={ApplicationViewSwitch}
        />
      )}
    </PermissionsPageLayout>
  );
};

const APPLICATION_VIEWS: EntityView[] = ["group"];

function ApplicationViewSwitch() {
  const navigate = useNavigate();
  return (
    <Box w="12rem">
      <EntityViewSwitch
        value="group"
        views={APPLICATION_VIEWS}
        onChange={(view) =>
          view === "preview" &&
          navigate(`${getPermissionsBasePath()}/application/preview`)
        }
      />
    </Box>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ApplicationPermissionsPage);
