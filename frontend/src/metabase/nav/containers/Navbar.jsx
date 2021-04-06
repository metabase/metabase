/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { PLUGIN_ADMIN_NAV_ITEMS } from "metabase/plugins";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import cx from "classnames";
import { t } from "ttag";
import { Flex, Box } from "grid-styled";

import * as Urls from "metabase/lib/urls";
import { color, darken } from "metabase/lib/colors";

import Icon, { IconWrapper } from "metabase/components/Icon";
import EntityMenu from "metabase/components/EntityMenu";
import Link from "metabase/components/Link";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";

import ProfileLink from "metabase/nav/components/ProfileLink";
import SearchBar from "metabase/nav/components/SearchBar";

import CreateDashboardModal from "metabase/components/CreateDashboardModal";

import { getPath, getContext, getUser } from "../selectors";
import {
  getHasDataAccess,
  getHasNativeWrite,
  getPlainNativeQuery,
} from "metabase/new_query/selectors";
import Database from "metabase/entities/databases";

const mapStateToProps = (state, props) => ({
  path: getPath(state, props),
  context: getContext(state, props),
  user: getUser(state),
  plainNativeQuery: getPlainNativeQuery(state),
  hasDataAccess: getHasDataAccess(state),
  hasNativeWrite: getHasNativeWrite(state),
});

import { DefaultSearchColor } from "metabase/nav/constants";

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

const NavHover = {
  backgroundColor: darken(color("nav")),
  color: "white",
};

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";

@Database.loadList({
  // set this to false to prevent a potential spinner on the main nav
  loadingAndErrorWrapper: false,
})
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
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
  renderAdminNav() {
    return (
      // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
      // TODO: hide nav using state in redux instead?
      <nav className={"Nav AdminNav sm-py1"}>
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
              key="admin-nav-settings"
            />
            <AdminNavItem
              name={t`People`}
              path="/admin/people"
              currentPath={this.props.path}
              key="admin-nav-people"
            />
            <AdminNavItem
              name={t`Data Model`}
              path="/admin/datamodel"
              currentPath={this.props.path}
              key="admin-nav-datamodel"
            />
            <AdminNavItem
              name={t`Databases`}
              path="/admin/databases"
              currentPath={this.props.path}
              key="admin-nav-databases"
            />
            <AdminNavItem
              name={t`Permissions`}
              path="/admin/permissions"
              currentPath={this.props.path}
              key="admin-nav-permissions"
            />
            {PLUGIN_ADMIN_NAV_ITEMS.map(({ name, path }) => (
              <AdminNavItem
                name={name}
                path={path}
                currentPath={this.props.path}
                key={`admin-nav-${name}`}
              />
            ))}
            <AdminNavItem
              name={t`Troubleshooting`}
              path="/admin/troubleshooting"
              currentPath={this.props.path}
              key="admin-nav-troubleshooting"
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
        {this.renderModal()}
      </nav>
    );
  }

  renderMainNav() {
    const { hasDataAccess, hasNativeWrite } = this.props;

    return (
      <Flex
        // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
        // TODO: hide nav using state in redux instead?
        className="Nav relative bg-brand text-white z3 flex-no-shrink"
        align="center"
        style={{ backgroundColor: color("nav") }}
        py={1}
        pr={2}
      >
        <Flex style={{ minWidth: 64 }} align="center" justify="center">
          <Link
            to="/"
            data-metabase-event={"Navbar;Logo"}
            className="relative cursor-pointer z2 rounded flex justify-center transition-background"
            p={1}
            mx={1}
            hover={{ backgroundColor: DefaultSearchColor }}
          >
            <Flex
              style={{ minWidth: 32, height: 32 }}
              align="center"
              justify="center"
            >
              <LogoIcon dark height={32} />
            </Flex>
          </Link>
        </Flex>
        <Flex className="flex-full z1" pr={2} align="center">
          <Box w={1} style={{ maxWidth: 500 }}>
            <SearchBar
              location={this.props.location}
              onChangeLocation={this.props.onChangeLocation}
            />
          </Box>
        </Flex>
        <Flex ml="auto" align="center" pl={[1, 2]} className="relative z2">
          {hasDataAccess && (
            <Link
              mr={[1, 2]}
              to={Urls.newQuestionFlow()}
              p={1}
              hover={{
                backgroundColor: darken(color("brand")),
              }}
              className="flex align-center rounded transition-background"
              data-metabase-event={`NavBar;New Question`}
            >
              <Icon name="insight" size={18} />
              <h4 className="hide sm-show ml1 text-nowrap">{t`Ask a question`}</h4>
            </Link>
          )}
          {hasDataAccess && (
            <IconWrapper
              className="relative hide sm-show mr1 overflow-hidden"
              hover={NavHover}
            >
              <Link
                to="browse"
                className="flex align-center rounded transition-background"
                data-metabase-event={`NavBar;Data Browse`}
              >
                <Icon
                  name="table_spaced"
                  size={14}
                  p={"11px"}
                  tooltip={t`Browse data`}
                />
              </Link>
            </IconWrapper>
          )}
          <EntityMenu
            tooltip={t`Create`}
            className="hide sm-show mr1"
            triggerIcon="add"
            triggerProps={{ hover: NavHover }}
            items={[
              {
                title: t`New dashboard`,
                icon: `dashboard`,
                action: () => this.setModal(MODAL_NEW_DASHBOARD),
                event: `NavBar;New Dashboard Click;`,
              },
              {
                title: t`New pulse`,
                icon: `pulse`,
                link: Urls.newPulse(),
                event: `NavBar;New Pulse Click;`,
              },
            ]}
          />
          {hasNativeWrite && (
            <IconWrapper
              className="relative hide sm-show mr1 overflow-hidden"
              hover={NavHover}
            >
              <Link
                to={this.props.plainNativeQuery.question().getUrl()}
                className="flex align-center"
                data-metabase-event={`NavBar;SQL`}
              >
                <Icon size={18} p={"11px"} name="sql" tooltip={t`Write SQL`} />
              </Link>
            </IconWrapper>
          )}
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
          {modal === MODAL_NEW_DASHBOARD ? (
            <CreateDashboardModal
              createDashboard={this.props.createDashboard}
              onClose={() => this.setState({ modal: null })}
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

    if (!user) {
      return null;
    }

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
