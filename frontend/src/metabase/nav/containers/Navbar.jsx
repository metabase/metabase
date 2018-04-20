import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";
import { Box, Flex } from "rebass";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";

import { normal, saturated } from "metabase/lib/colors";

import Button from "metabase/components/Button.jsx";
import Icon from "metabase/components/Icon.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import ProfileLink from "metabase/nav/components/ProfileLink.jsx";

import { getPath, getContext, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
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

class SearchBar extends React.Component {
  state = {
    active: false,
  };

  render() {
    return (
      <Flex align="center">
        <Icon name="search" />
        <input
          type="text"
          placeholder="Search for anything..."
          className="input bg-transparent borderless"
          onClick={() => this.setState({ active: true })}
          style={{
            width: this.state.active ? 600 : 320,
            maxWidth: 600,
          }}
        />
      </Flex>
    );
  }
}

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
              <LogoIcon className="text-brand my2" />
            </Link>
          </li>
        </ul>
      </nav>
    );
  }

  renderMainNav() {
    return (
      <Flex
        style={{
          backgroundColor: "#FDFDFD",
          borderBottom: "1px solid #DCE1E4",
        }}
        className="relative"
        align="center"
      >
        <Box className="">
          <Link
            to="/"
            data-metabase-event={"Navbar;Logo"}
            className="LogoNavItem NavItem cursor-pointer flex align-center transition-background justify-center"
            activeClassName="NavItem--selected"
          >
            <LogoIcon />
          </Link>
        </Box>
        <Box my={1} p={1} className="wrapper lg-wrapper--trim">
          {/* <SearchBar /> */}
        </Box>
        <Flex className="ml-auto" align="center">
          <Box mx={1}>
            <Link to="reference">
              <Button primary medium icon="document">
                Reference
              </Button>
            </Link>
          </Box>
          <PopoverWithTrigger triggerElement={<Button medium>New</Button>}>
            <Box p={3} style={{ minWidth: 300 }}>
              <Box my={2}>
                <Link to="question/new">
                  <Flex align="center" style={{ color: normal.red }}>
                    <Icon name="beaker" />
                    <h3>Question</h3>
                  </Flex>
                </Link>
              </Box>
              <Box my={2}>
                <Link to="dashboard/new">
                  <Flex align="center" style={{ color: normal.blue }}>
                    <Icon name="dashboard" />
                    <h3>Dashboard</h3>
                  </Flex>
                </Link>
              </Box>
              <Box my={2}>
                <Flex align="center" style={{ color: saturated.yellow }}>
                  <Icon name="pulse" />
                  <h3>Pulse</h3>
                </Flex>
              </Box>
              <Box my={2}>
                <Link to="collections/create">
                  <Flex align="center" style={{ color: "#93B3C9" }}>
                    <Icon name="all" />
                    <h3>Collection</h3>
                  </Flex>
                </Link>
              </Box>
            </Box>
          </PopoverWithTrigger>
          <Box mx={1}>
            <Link to="activity">
              <Icon name="alert" />
            </Link>
          </Box>
          <ProfileLink {...this.props} />
        </Flex>
      </Flex>
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
