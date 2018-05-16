import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";
import { Box, Flex } from "rebass";

import { connect } from "react-redux";
import { push } from "react-router-redux";
import { Link } from "react-router";

import { createDashboard } from "metabase/dashboards/dashboards";

import { normal, saturated } from "metabase/lib/colors";

import Button from "metabase/components/Button.jsx";
import Icon from "metabase/components/Icon.jsx";
import LogoIcon from "metabase/components/LogoIcon.jsx";
import Tooltip from "metabase/components/Tooltip";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import Modal from "metabase/components/Modal";

import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import CollectionEdit from "metabase/questions/containers/CollectionCreate";

import ProfileLink from "metabase/nav/components/ProfileLink.jsx";

import { getPath, getContext, getUser } from "../selectors";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
});

const mapDispatchToProps = {
  onChangeLocation: push,
  createDashboard,
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

/*
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
*/

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
  state = {
    modal: null,
  };

  static propTypes = {
    context: PropTypes.string.isRequired,
    path: PropTypes.string.isRequired,
    user: PropTypes.object,
  };

  isActive(path) {
    return this.props.path.startsWith(path);
  }

  setModal(modal) {
    this.setState({ modal });
    if (this._newPopover) {
      this._newPopover.close();
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.location !== this.props.location) {
      this.setState({ modal: null });
      if (this._newPopover) {
        this._newPopover.close();
      }
    }
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
        {this.renderModal()}
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
        {this.renderModal()}
      </nav>
    );
  }

  renderMainNav() {
    return (
      <Flex className="relative bg-brand text-white z4" align="center">
        <Box ml={1}>
          <Link
            to="/"
            data-metabase-event={"Navbar;Logo"}
            className="LogoNavItem NavItem cursor-pointer flex align-center transition-background justify-center"
            activeClassName="NavItem--selected"
          >
            <LogoIcon dark />
          </Link>
        </Box>
        <Box my={1} p={1} className="wrapper lg-wrapper--trim">
          {/* <SearchBar /> */}
        </Box>
        <Flex ml="auto" align="center">
          <PopoverWithTrigger
            ref={e => (this._newPopover = e)}
            triggerElement={
              <Button medium mr={3} color="#509ee3">
                New
              </Button>
            }
          >
            <Box py={2} px={3} style={{ minWidth: 300 }}>
              <Box my={2}>
                <Link to="question/new">
                  <Flex align="center" style={{ color: normal.red }}>
                    <Icon name="beaker" mr={1} />
                    <h3>Question</h3>
                  </Flex>
                </Link>
              </Box>
              <Box my={2}>
                <Flex
                  align="center"
                  style={{ color: normal.blue }}
                  className="cursor-pointer"
                  onClick={() => this.setModal(MODAL_NEW_DASHBOARD)}
                >
                  <Icon name="dashboard" mr={1} />
                  <h3>Dashboard</h3>
                </Flex>
              </Box>
              <Box my={2}>
                <Link to="pulse/new">
                  <Flex align="center" style={{ color: saturated.yellow }}>
                    <Icon name="pulse" mr={1} />
                    <h3>Pulse</h3>
                  </Flex>
                </Link>
              </Box>
              <Box my={2}>
                <Flex
                  align="center"
                  style={{ color: "#93B3C9" }}
                  className="cursor-pointer"
                  onClick={() => this.setModal(MODAL_NEW_COLLECTION)}
                >
                  <Icon name="all" mr={1} />
                  <h3>Collection</h3>
                </Flex>
              </Box>
            </Box>
          </PopoverWithTrigger>
          <Box mx={2}>
            <Tooltip tooltip={t`Browse data`}>
              <Link to="browse">
                <Icon name="grid" />
              </Link>
            </Tooltip>
          </Box>
          <Box mx={2}>
            <Tooltip tooltip={t`Reference`}>
              <Link to="reference">
                <Icon name="reference" />
              </Link>
            </Tooltip>
          </Box>
          <Box mx={2}>
            <Tooltip tooltip={t`Activity`}>
              <Link to="activity">
                <Icon name="alert" />
              </Link>
            </Tooltip>
          </Box>
          <ProfileLink {...this.props} />
        </Flex>
        {this.renderModal()}
      </Flex>
    );
  }

  renderModal() {
    const { modal } = this.state;
    if (modal) {
      return (
        <Modal onClose={() => this.setState({ modal: null })}>
          {modal === MODAL_NEW_COLLECTION ? (
            <CollectionEdit />
          ) : modal === MODAL_NEW_DASHBOARD ? (
            <CreateDashboardModal
              createDashboard={this.props.createDashboard}
            />
          ) : null}
        </Modal>
      );
    } else {
      return null;
    }
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
