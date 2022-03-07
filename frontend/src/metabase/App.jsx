/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";
import ScrollToTop from "metabase/hoc/ScrollToTop";
import Navbar from "metabase/nav/containers/Navbar";
import SearchBar from "metabase/nav/components/SearchBar";
import {
  SearchBarContainer,
  SearchBarContent,
} from "metabase/nav/containers/Navbar.styled";

import { IFRAMED, initializeIframeResizer } from "metabase/lib/dom";

import UndoListing from "metabase/containers/UndoListing";
import StatusListing from "metabase/status/containers/StatusListing";
import AppErrorCard from "metabase/components/AppErrorCard/AppErrorCard";

import {
  Archived,
  NotFound,
  GenericError,
  Unauthorized,
} from "metabase/containers/ErrorPages";

import ProfileLink from "metabase/nav/components/ProfileLink";
import Icon from "metabase/components/Icon";

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

@connect(mapStateToProps, mapDispatchToProps)
export default class App extends Component {
  state = {
    errorInfo: undefined,
    sidebarOpen: true,
  };

  constructor(props) {
    super(props);
    initializeIframeResizer();
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
  }

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

  toggleSidebar = () => {
    this.setState({ sidebarOpen: !this.state.sidebarOpen });
  };

  render() {
    const { children, location, errorPage, onChangeLocation } = this.props;
    const { errorInfo } = this.state;

    return (
      <ScrollToTop>
        <div
          className="relative flex"
          style={{ height: "100vh", overflow: "hidden" }}
        >
          {this.hasNavbar() && this.state.sidebarOpen && (
            <Navbar location={location} />
          )}
          {errorPage ? (
            getErrorComponent(errorPage)
          ) : (
            <div className="full overflow-auto">
              <div className="full flex align-center bg-white border-bottom px2 relative z2">
                <Icon
                  name="burger"
                  className="text-brand-hover cursor-pointer"
                  onClick={() => this.toggleSidebar()}
                />
                <SearchBarContainer>
                  <SearchBarContent>
                    <SearchBar
                      location={location}
                      onChangeLocation={onChangeLocation}
                    />
                  </SearchBarContent>
                </SearchBarContainer>
                <div className="ml-auto">
                  <ProfileLink {...this.props} />
                </div>
              </div>
              {children}
            </div>
          )}
          <UndoListing />
          <StatusListing />
        </div>
        <AppErrorCard errorInfo={errorInfo} />
      </ScrollToTop>
    );
  }
}
