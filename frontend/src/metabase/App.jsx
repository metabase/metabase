/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import _ from "underscore";

import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";
import Modal from "metabase/components/Modal";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import ScrollToTop from "metabase/hoc/ScrollToTop";
import AppBar from "metabase/nav/containers/AppBar";
import Navbar from "metabase/nav/containers/Navbar";
import * as Urls from "metabase/lib/urls";

import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";
import UndoListing from "metabase/containers/UndoListing";
import StatusListing from "metabase/status/containers/StatusListing";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import { getIsEditing as getIsEditingDashboard } from "metabase/dashboard/selectors";

import { toggleNavbar, closeNavbar, getIsNavbarOpen } from "metabase/redux/app";
import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import { AppContentContainer, AppContent } from "./App.styled";

export const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
export const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

const mapStateToProps = state => ({
  currentUser: state.currentUser,
  errorPage: state.app.errorPage,
  isSidebarOpen: getIsNavbarOpen(state),
  isEditingDashboard: getIsEditingDashboard(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  toggleNavbar,
  closeNavbar,
};

const getErrorComponent = ({ status, data, context }) => {
  if (status === 403) {
    return <Unauthorized />;
  } else if (status === 404 || data?.error_code === "not-found") {
    return <NotFound />;
  } else if (
    data &&
    data.error_code === "archived" &&
    context === "dashboard"
  ) {
    return <Archived entityName="dashboard" linkTo="/dashboards/archive" />;
  } else if (
    data &&
    data.error_code === "archived" &&
    context === "query-builder"
  ) {
    return <Archived entityName="question" linkTo="/questions/archive" />;
  } else {
    return <GenericError details={data && data.message} />;
  }
};

const PATHS_WITHOUT_NAVBAR = [/\/model\/.*\/query/, /\/model\/.*\/metadata/];

const EMBEDDED_ROUTES_WITH_NAVBAR = ["/collection", "/archive"];

class App extends Component {
  state = {
    errorInfo: undefined,
  };

  constructor(props) {
    super(props);
    initializeIframeResizer();
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

  isAdminApp = () => {
    const { pathname } = this.props.location;
    return pathname.startsWith("/admin/");
  };

  hasNavbar = () => {
    const {
      currentUser,
      isEditingDashboard,
      location: { pathname },
    } = this.props;
    if (!currentUser || isEditingDashboard) {
      return false;
    }
    if (IFRAMED) {
      return EMBEDDED_ROUTES_WITH_NAVBAR.some(path =>
        pathname.startsWith(path),
      );
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  };

  hasAppBar = () => {
    const {
      currentUser,
      location: { pathname },
      isEditingDashboard,
    } = this.props;
    if (!currentUser || IFRAMED || this.isAdminApp() || isEditingDashboard) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  };

  closeModal = () => {
    this.setState({ modal: null });
  };

  setModal = modal => {
    this.setState({ modal });
    if (this._newPopover) {
      this._newPopover.close();
    }
  };

  renderModalContent() {
    const { modal } = this.state;
    const { onChangeLocation } = this.props;

    switch (modal) {
      case MODAL_NEW_COLLECTION:
        return (
          <CollectionCreate
            onClose={() => this.setState({ modal: null })}
            onSaved={collection => {
              this.setState({ modal: null });
              onChangeLocation(Urls.collection(collection));
            }}
          />
        );
      case MODAL_NEW_DASHBOARD:
        return (
          <CreateDashboardModal
            onClose={() => this.setState({ modal: null })}
          />
        );
      default:
        return null;
    }
  }

  renderModal = () => {
    const { modal } = this.state;

    if (modal) {
      return (
        <Modal onClose={this.closeModal}>{this.renderModalContent()}</Modal>
      );
    } else {
      return null;
    }
  };

  render() {
    const {
      isSidebarOpen,
      children,
      location,
      errorPage,
      onChangeLocation,
      toggleNavbar,
      closeNavbar,
    } = this.props;
    const { errorInfo } = this.state;
    const hasAppBar = this.hasAppBar();
    return (
      <ScrollToTop>
        {errorPage ? (
          getErrorComponent(errorPage)
        ) : (
          <>
            {hasAppBar && (
              <AppBar
                isSidebarOpen={isSidebarOpen}
                location={location}
                onNewClick={this.setModal}
                onToggleSidebarClick={toggleNavbar}
                handleCloseSidebar={closeNavbar}
                onChangeLocation={onChangeLocation}
              />
            )}
            <AppContentContainer
              hasAppBar={hasAppBar}
              isAdminApp={this.isAdminApp()}
            >
              {this.hasNavbar() && (
                <Navbar isOpen={isSidebarOpen} location={location} />
              )}
              <AppContent>{children}</AppContent>
              {this.renderModal()}
              <UndoListing />
              <StatusListing />
            </AppContentContainer>
          </>
        )}
        <AppErrorCard errorInfo={errorInfo} />
      </ScrollToTop>
    );
  }
}

export default connect(mapStateToProps, mapDispatchToProps)(App);
