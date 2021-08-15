import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t } from "ttag";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import Button from "metabase/components/Button";
import fitViewport from "metabase/hoc/FitViewPort";
import Modal from "metabase/components/Modal";
import ModalContent from "metabase/components/ModalContent";

import { PermissionsTabs } from "./PermissionsTabs";
import { FullHeightContainer } from "./PermissionsPageLayout.styled";
import { PermissionsEditBar } from "./PermissionsEditBar";
import { useLeaveConfirmation } from "../../hooks/use-leave-confirmation";
import { withRouter } from "react-router";
import { clearSaveError } from "../../permissions";

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
}) {
  const beforeLeaveConfirmation = useLeaveConfirmation({
    router,
    route,
    onConfirm: navigateToLocation,
    isEnabled: isDirty,
  });

  return (
    <FullHeightContainer flexDirection="column">
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

      <div className="border-bottom">
        <PermissionsTabs tab={tab} onChangeTab={navigateToTab} />
      </div>

      <FullHeightContainer>{children}</FullHeightContainer>
    </FullHeightContainer>
  );
}

PermissionsPageLayout.propTypes = propTypes;

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

export default _.compose(
  connect(
    mapStateToProps,
    mapDispatchToProps,
  ),
  fitViewport,
  withRouter,
)(PermissionsPageLayout);
