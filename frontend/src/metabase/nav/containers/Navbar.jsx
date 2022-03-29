/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { withRouter } from "react-router";

import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color, darken } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import LogoIcon from "metabase/components/LogoIcon";
import { AdminNavbar } from "../components/AdminNavbar";
import ProfileLink from "metabase/nav/components/ProfileLink";

import { getPath, getContext, getUser } from "../selectors";
import {
  getHasDataAccess,
  getPlainNativeQuery,
} from "metabase/new_query/selectors";
import Database from "metabase/entities/databases";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
  plainNativeQuery: getPlainNativeQuery(state),
  hasDataAccess: getHasDataAccess(state),
});

import { ProfileLinkContainer, NavRoot } from "./Navbar.styled";
import CollectionSidebar from "../../collections/containers/CollectionSidebar/CollectionSidebar";
import Footer from "metabase/collections/components/CollectionSidebar/CollectionSidebarFooter";

const mapDispatchToProps = {
  onChangeLocation: push,
};

@Database.loadList({
  // set this to false to prevent a potential spinner on the main nav
  loadingAndErrorWrapper: false,
})
@withRouter
@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
  state = {
    modal: null,
    shouldDisplayMobileSidebar: false,
  };

  static propTypes = {
    context: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    user: PropTypes.object,
  };

  isActive(path) {
    return this.props.path.startsWith(path);
  }

  renderEmptyNav() {
    return (
      // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
      // TODO: hide nav using state in redux instead?
      <nav className="Nav sm-py1 relative">
        <ul className="wrapper flex align-center">
          <li>
            <Link
              to="/"
              data-metabase-event={"Navbar;Logo"}
              className="NavItem cursor-pointer flex align-center"
            >
              <LogoIcon className="text-brand my2" />
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  renderMainNav() {
    const { hasDataAccess, router, user } = this.props;
    const collectionId = Urls.extractCollectionId(router.params.slug);
    const isRoot = collectionId === "root";

    const shouldDisplayMobileSidebar = this.state.shouldDisplayMobileSidebar;

    return (
      <NavRoot
        // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
        // TODO: hide nav using state in redux instead?
        className="Nav"
      >
        <CollectionSidebar
          isRoot={isRoot}
          handleToggleMobileSidebar={() => {
            this.setState({
              shouldDisplayMobileSidebar: !this.state
                .shouldDisplayMobileSidebar,
            });
          }}
          collectionId={collectionId}
          shouldDisplayMobileSidebar={shouldDisplayMobileSidebar}
        />
        {hasDataAccess && (
          <Link
            mr={[1, 2]}
            to="browse"
            p={1}
            hover={{
              backgroundColor: darken(color("brand")),
            }}
            className="flex align-center rounded transition-background ml2"
            data-metabase-event={`NavBar;Data Browse`}
          >
            <Icon name="table_spaced" size={14} />
            <h4 className="hide sm-show ml1 text-nowrap">{t`Browse data`}</h4>
          </Link>
        )}
        <Footer isAdmin={user.is_superuser} />
        <ProfileLinkContainer>
          <ProfileLink {...this.props} user={user} />
        </ProfileLinkContainer>
      </NavRoot>
    );
  }

  render() {
    const { context, user } = this.props;

    if (!user) {
      return null;
    }

    switch (context) {
      case "admin":
        return <AdminNavbar {...this.props} />;
      case "auth":
        return null;
      case "none":
        return this.renderEmptyNav();
      case "setup":
        return null;
      default:
        return this.renderMainNav();
    }
  }
}
