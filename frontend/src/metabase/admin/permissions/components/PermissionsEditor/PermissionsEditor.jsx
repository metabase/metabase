import PropTypes from "prop-types";

import Loading from "metabase/components/Loading";

import { PermissionsEditorRoot } from "./PermissionsEditor.styled";
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
    <PermissionsEditorRoot>
      <Loading loading={isLoading} error={error}>
        <PermissionsEditorContent {...contentProps} />
      </Loading>
    </PermissionsEditorRoot>
  );
};

PermissionsEditor.propTypes = permissionEditorPropTypes;
