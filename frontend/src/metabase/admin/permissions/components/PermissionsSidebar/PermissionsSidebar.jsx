import React from "react";
import PropTypes from "prop-types";

import {
  PermissionsSidebarContent,
  permissionSidebarContentPropTypes,
} from "./PermissionsSidebarContent";
import { SidebarRoot } from "./PermissionsSidebar.styled";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export const permissionSidebarPropTypes = {
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  ...permissionSidebarContentPropTypes,
};

export const PermissionsSidebar = ({ isLoading, error, ...contentProps }) => {
  return (
    <SidebarRoot>
      <LoadingAndErrorWrapper loading={isLoading} error={error}>
        <PermissionsSidebarContent {...contentProps} />
      </LoadingAndErrorWrapper>
    </SidebarRoot>
  );
};

PermissionsSidebar.propTypes = permissionSidebarPropTypes;
