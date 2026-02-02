import PropTypes from "prop-types";

import { UpsellPermissions } from "metabase/admin/upsells";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box } from "metabase/ui";

import S from "./PermissionsEditor.module.css";
import {
  PermissionsEditorContent,
  permissionEditorContentPropTypes,
} from "./PermissionsEditorContent";

export const permissionEditorPropTypes = {
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  ...permissionEditorContentPropTypes,
};

export const PermissionsEditor = ({ isLoading, error, ...contentProps }) => {
  return (
    <div className={S.PermissionsEditorRoot}>
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <>
          <Box mx="xl" mb="md">
            <UpsellPermissions location="settings-permissions" />
          </Box>
          <PermissionsEditorContent {...contentProps} />
        </>
      </LoadingAndErrorWrapper>
    </div>
  );
};

PermissionsEditor.propTypes = permissionEditorPropTypes;
