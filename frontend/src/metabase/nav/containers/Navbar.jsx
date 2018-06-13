import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import * as Urls from "metabase/lib/urls";

import ProfileLink from "metabase/nav/components/ProfileLink.jsx";

import { getPath, getContext, getUser } from "../selectors";

import RetinaImage from "react-retina-image";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
};

const BUTTON_PADDING_STYLES = {
  navButton: {
    paddingLeft: "1.0rem",
    paddingRight: "1.0rem",
    paddingTop: "0.75rem",
    paddingBottom: "0.75rem",
  },

  newQuestion: {
    paddingLeft: "1.0rem",
    paddingRight: "1.0rem",
    paddingTop: "0.75rem",
    paddingBottom: "0.75rem",
  },
};

const AdminNavItem = ({ name, path, currentPath }) => (
  <li>
    <Link
      to={path}
      data-metabase-event={`NavBar;${name}`}
      className={cx("NavItem py1 px2 no-decoration", {
        "is--selected": currentPath.startsWith(path),
      })}
    >
      {name}
    </Link>
  </li>
);

const MainNavLink = ({ to, name, eventName, icon }) => (
  <Link
    to={to}
    data-metabase-event={`NavBar;${eventName}`}
    style={BUTTON_PADDING_STYLES.navButton}
    className={
      "NavItem cursor-pointer flex-full text-white text-bold no-decoration flex align-center px2 transition-background"
    }
    activeClassName="NavItem--selected"
  >
    <Icon name={icon} className="md-hide" />
    <span className="hide md-show">{name}</span>
  </Link>
);

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

  renderAdminNav() {
    return (
      <nav className={cx("Nav AdminNav sm-py1")}>
        <div className="sm-pl4 flex align-center pr1">
          <div className="NavTitle flex align-center">
            <Icon name={"gear"} className="AdminGear" size={22} />
            <span className="NavItem-text ml1 hide sm-show text-bold">{t`Metabase Admin`}</span>
          </div>

          <ul className="sm-ml4 flex flex-full">
            <AdminNavItem
              name={t`Settings`}
              path="/admin/settings"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`People`}
              path="/admin/people"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Data Model`}
              path="/admin/datamodel"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Databases`}
              path="/admin/databases"
              currentPath={this.props.path}
            />
            <AdminNavItem
              name={t`Permissions`}
              path="/admin/permissions"
              currentPath={this.props.path}
            />
          </ul>

          <ProfileLink {...this.props} />
        </div>
      </nav>
    );
  }

  renderEmptyNav() {
    return (
      <nav className="Nav sm-py1 relative">
        <ul className="wrapper flex align-center">
          <li>
            <Link
              to="/"
              data-metabase-event={"Navbar;Logo"}
              className="NavItem cursor-pointer flex align-center"
            >
              <RetinaImage
                                                  className="mx1"
                                                  src="app/img/stratio-logo.png"
                                                  width={79}
                                                  forceOriginalDimensions={false /* broken in React v0.13 */}
                                              />
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  renderMainNav() {
    return (
      <nav className="Nav relative bg-brand">
        <ul className="md-pl4 flex align-center md-pr1">
          <li>
            <Link
              to="/"
              data-metabase-event={"Navbar;Logo"}
              className="LogoNavItem NavItem cursor-pointer text-white flex align-center transition-background justify-center"
              activeClassName="NavItem--selected"
            >
              <RetinaImage
                                              className="mx1"
                                              src="app/img/stratio-logo.png"
                                              width={79}
                                              forceOriginalDimensions={false /* broken in React v0.13 */}
                                          />
            </Link>
          </li>
          <li className="md-pl3 hide xs-show">
            <MainNavLink
              to="/dashboards"
              name={t`Dashboards`}
              eventName="Dashboards"
              icon="dashboard"
            />
          </li>
          <li className="md-pl1 hide xs-show">
            <MainNavLink
              to="/questions"
              name={t`Questions`}
              eventName="Questions"
              icon="all"
            />
          </li>
          <li className="md-pl1 hide xs-show">
            <MainNavLink
              to="/pulse"
              name={t`Pulses`}
              eventName="Pulses"
              icon="pulse"
            />
          </li>
          <li className="md-pl1 hide xs-show">
            <MainNavLink
              to="/reference/guide"
              name={t`Data Reference`}
              eventName="DataReference"
              icon="reference"
            />
          </li>
          <li className="md-pl3 hide sm-show">
            <Link
              to={Urls.newQuestion()}
              data-metabase-event={"Navbar;New Question"}
              style={BUTTON_PADDING_STYLES.newQuestion}
              className="NavNewQuestion rounded inline-block bg-white text-brand text-bold cursor-pointer px2 no-decoration transition-all"
            >
              {t`New Question`}
            </Link>
          </li>
          <li className="flex-align-right transition-background hide sm-show">
            <div className="inline-block text-white">
              <ProfileLink {...this.props} />
            </div>
          </li>
        </ul>
      </nav>
    );
  }

  render() {
    const { context, user } = this.props;

    if (!user) return null;

    switch (context) {
      case "admin":
        return this.renderAdminNav();
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
