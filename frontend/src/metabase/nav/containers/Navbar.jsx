/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { withRouter } from "react-router";

import Link from "metabase/core/components/Link";
import LogoIcon from "metabase/components/LogoIcon";
import { AdminNavbar } from "../components/AdminNavbar";

import { closeNavbar } from "metabase/redux/app";

import { getPath, getContext, getUser } from "../selectors";
import { getHasDataAccess } from "metabase/new_query/selectors";
import Database from "metabase/entities/databases";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
  hasDataAccess: getHasDataAccess(state),
});

import { NavRoot } from "./Navbar.styled";

import MainNavbar from "./MainNavbar";

const mapDispatchToProps = {
  onChangeLocation: push,
  closeNavbar,
};

@Database.loadList({
  // set this to false to prevent a potential spinner on the main nav
  loadingAndErrorWrapper: false,
})
@withRouter
@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
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
    const { isOpen, location, params, closeNavbar } = this.props;
    // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
    return (
      <NavRoot className="Nav" isOpen={isOpen} aria-hidden={!isOpen}>
        <MainNavbar
          isOpen={isOpen}
          location={location}
          params={params}
          closeNavbar={closeNavbar}
        />
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
