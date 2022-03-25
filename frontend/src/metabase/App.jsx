/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import Navbar from "metabase/nav/containers/Navbar";
import SearchBar from "metabase/nav/components/SearchBar";
import * as Urls from "metabase/lib/urls";
import LogoIcon from "metabase/components/LogoIcon";

import {
  SearchBarContainer,
  SearchBarContent,
} from "metabase/nav/containers/Navbar.styled";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import UndoListing from "metabase/containers/UndoListing";
import StatusListing from "metabase/status/containers/StatusListing";
import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";
import NewButton from "metabase/nav/containers/NewButton";
import Modal from "metabase/components/Modal";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";
import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";

import {
  AppContentContainer,
  AppContent,
  AppBar,
  LogoIconWrapper,
} from "./App.styled";

export const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
export const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

const mapStateToProps = (state, props) => ({
  errorPage: state.app.errorPage,
  currentUser: state.currentUser,
});

const mapDispatchToProps = {
  onChangeLocation: push,
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

const PATHS_WITH_COLLAPSED_NAVBAR = [
  /\/model.*/,
  /\/question.*/,
  /\/dashboard.*/,
];

function checkIsSidebarInitiallyOpen(locationPathName) {
  return !PATHS_WITH_COLLAPSED_NAVBAR.some(pattern =>
    pattern.test(locationPathName),
  );
}

@connect(mapStateToProps, mapDispatchToProps)
export default class App extends Component {
  state = {
    errorInfo: undefined,
    sidebarOpen: checkIsSidebarInitiallyOpen(this.props.location.pathname),
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
      location: { pathname },
    } = this.props;
    if (!currentUser || IFRAMED) {
      return false;
    }
    return !PATHS_WITHOUT_NAVBAR.some(pattern => pattern.test(pathname));
  };

  hasAppBar = () => {
    const { currentUser } = this.props;
    return currentUser && !this.isAdminApp();
  };

  toggleSidebar = () => {
    this.setState({ sidebarOpen: !this.state.sidebarOpen });
  };

  renderAppBar = () => {
    const { location, onChangeLocation } = this.props;
    return (
      <AppBar>
        <LogoIconWrapper
          onClick={this.toggleSidebar}
          sidebarOpen={this.state.sidebarOpen}
        >
          <LogoIcon size={24} />
        </LogoIconWrapper>
        <SearchBarContainer>
          <SearchBarContent>
            <SearchBar
              location={location}
              onChangeLocation={onChangeLocation}
            />
          </SearchBarContent>
        </SearchBarContainer>
        <NewButton setModal={this.setModal} />
      </AppBar>
    );
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
    const { children, location, errorPage } = this.props;
    const { errorInfo, sidebarOpen } = this.state;

    return (
      <ScrollToTop>
        {errorPage ? (
          getErrorComponent(errorPage)
        ) : (
          <>
            {this.hasAppBar() && this.renderAppBar()}
            <AppContentContainer isAdminApp={this.isAdminApp()}>
              {this.hasNavbar() && sidebarOpen && (
                <Navbar location={location} renderModal={this.renderModal} />
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
