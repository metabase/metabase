import PropTypes from "prop-types";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

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
      <LoadingAndErrorWrapper loading={isLoading} error={error} noWrapper>
        <PermissionsEditorContent {...contentProps} />
      </LoadingAndErrorWrapper>
    </PermissionsEditorRoot>
  );
};

PermissionsEditor.propTypes = permissionEditorPropTypes;
