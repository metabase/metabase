import React, { useState } from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import { withRouter } from "react-router";

import Button from "metabase/core/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { useLeaveConfirmation } from "../../hooks/use-leave-confirmation";
import { clearSaveError } from "../../permissions";
import { ToolbarButton } from "../ToolbarButton";
import { PermissionsTabs } from "./PermissionsTabs";
import {
  FullHeightContainer,
  TabsContainer,
  PermissionPageRoot,
  PermissionPageContent,
  PermissionPageSidebar,
  CloseSidebarButton,
  ToolbarButtonsContainer,
} from "./PermissionsPageLayout.styled";
import { PermissionsEditBar } from "./PermissionsEditBar";

const mapDispatchToProps = {
  navigateToTab: tab => push(`/admin/permissions/${tab}`),
  navigateToLocation: location => push(location.pathname, location.state),
  clearSaveError,
};

const mapStateToProps = (state, _props) => {
  return {
    saveError: state.admin.permissions.saveError,
  };
};

const propTypes = {
  children: PropTypes.node.isRequired,
  tab: PropTypes.oneOf(["data", "collections"]).isRequired,
  confirmBar: PropTypes.node,
  diff: PropTypes.object,
  isDirty: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
  onLoad: PropTypes.func.isRequired,
  saveError: PropTypes.string,
  clearSaveError: PropTypes.func.isRequired,
  navigateToLocation: PropTypes.func.isRequired,
  router: PropTypes.object,
  route: PropTypes.object,
  navigateToTab: PropTypes.func.isRequired,
  helpContent: PropTypes.node,
  toolbarRightContent: PropTypes.node,
};

function PermissionsPageLayout({
  children,
  tab,
  diff,
  isDirty,
  onSave,
  onLoad,
  saveError,
  clearSaveError,
  router,
  route,
  navigateToLocation,
  navigateToTab,
  toolbarRightContent,
  helpContent,
}) {
  const [shouldShowHelp, setShouldShowHelp] = useState(false);
  const beforeLeaveConfirmation = useLeaveConfirmation({
    router,
    route,
    onConfirm: navigateToLocation,
    isEnabled: isDirty,
  });

  return (
    <PermissionPageRoot>
      <PermissionPageContent>
        {isDirty && (
          <PermissionsEditBar
            diff={diff}
            isDirty={isDirty}
            onSave={onSave}
            onCancel={() => onLoad()}
          />
        )}

        <Modal isOpen={saveError != null}>
          <ModalContent
            title={t`There was an error saving`}
            formModal
            onClose={clearSaveError}
          >
            <p className="mb4">{saveError}</p>
            <div className="ml-auto">
              <Button onClick={clearSaveError}>{t`OK`}</Button>
            </div>
          </ModalContent>
        </Modal>

        {beforeLeaveConfirmation}

        <TabsContainer className="border-bottom">
          <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
          <ToolbarButtonsContainer>
            {toolbarRightContent}
            {helpContent && !shouldShowHelp && (
              <ToolbarButton
                text={t`Permission help`}
                icon="info"
                onClick={() => setShouldShowHelp(prev => !prev)}
              />
            )}
          </ToolbarButtonsContainer>
        </TabsContainer>

        <FullHeightContainer>{children}</FullHeightContainer>
      </PermissionPageContent>

      {shouldShowHelp && (
        <PermissionPageSidebar>
          <CloseSidebarButton
            onClick={() => setShouldShowHelp(prev => !prev)}
          />
          {helpContent}
        </PermissionPageSidebar>
      )}
    </PermissionPageRoot>
  );
}

PermissionsPageLayout.propTypes = propTypes;

export default _.compose(
  connect(mapStateToProps, mapDispatchToProps),
  fitViewport,
  withRouter,
)(PermissionsPageLayout);
