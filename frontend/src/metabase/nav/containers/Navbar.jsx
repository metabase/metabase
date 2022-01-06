/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";
import { Flex, Box } from "grid-styled";

import * as Urls from "metabase/lib/urls";
import { color, darken } from "metabase/lib/colors";

import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";

import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
import ProfileLink from "metabase/nav/components/ProfileLink";
import SearchBar from "metabase/nav/components/SearchBar";

import CreateDashboardModal from "metabase/components/CreateDashboardModal";
import { AdminNavbar } from "../components/AdminNavbar";

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

import { getDefaultSearchColor } from "metabase/nav/constants";

const mapDispatchToProps = {
  onChangeLocation: push,
};

// TODO
const NavHover = {
  backgroundColor: darken(color("nav")),
  color: "white",
};

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";

@Database.loadList({
  // set this to false to prevent a potential spinner on the main nav
  loadingAndErrorWrapper: false,
})
@connect(mapStateToProps, mapDispatchToProps)
export default class Navbar extends Component {
  state = {
    modal: null,
    createOpen: false
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
    this.setState({ modal, createOpen: false });
    if (this._newPopover) {
      this._newPopover.close();
    }
  }
  renderAdminNav() {
    return (
      <>
        <AdminNavbar path={this.props.path} />
        {this.renderModal()}
      </>
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
            hover={{ backgroundColor: getDefaultSearchColor() }}
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
          <Box width={1} style={{ maxWidth: 500 }}>
            <SearchBar
              location={this.props.location}
              onChangeLocation={this.props.onChangeLocation}
            />
          </Box>
        </Flex>
        <Flex ml="auto" align="center" pl={[1, 2]} className="relative z2">
          <PopoverWithTrigger
            isOpen={this.state.createOpen}
            triggerElement={
              <div className="flex align-center transition-background mr2" onClick={() => this.setState({ createOpen: true })}>
                <Icon name="add" size={14} p={"8px"} />
                <h4 className="hide sm-show text-nowrap">{t`Create`}</h4>
              </div>
            }
          >
            <>
              <ol>
                <li>
                  <Link
                    onClick={() => this.setState({ createOpen: false })}
                    className="px3 py2 bg-brand-hover text-white-hover cursor-pointer flex align-center"
                    to={Urls.newQuestion({
                      mode: "notebook",
                      creationType: "complex_question",
                    })}
                  >
                    <Icon name="insight" mr={1} />
                    Visual question
                  </Link>
                </li>
                {hasNativeWrite && (
                  <li>
                    <Link
                      onClick={() => this.setState({ createOpen: false })}
                      className="px3 py2 bg-brand-hover text-white-hover cursor-pointer flex align-center"
                      to={Urls.newQuestion({
                        type: "native",
                        creationType: "native_question",
                      })}
                    >
                      <Icon name="sql" mr={1} />
                      Sql query
                    </Link>
                  </li>

                )}
              </ol>
              <ol className="border-top">
                <li
                  className="px3 py2 bg-brand-hover text-white-hover cursor-pointer flex align-center"
                  onClick={() => this.setModal(MODAL_NEW_DASHBOARD)}
                >
                  <Icon name="dashboard" mr={1} />
                  New dashboard
                </li>
                <li
                  className="px3 py2 bg-brand-hover text-white-hover cursor-pointer flex align-center"
                  onClick={() => this.setModal()}
                >
                  <Icon name="dataset" mr={1} size={18} />
                  New dataset
                </li>
                <li
                  className="px3 py2 bg-brand-hover text-white-hover cursor-pointer"
                  onClick={() => this.setModal()}
                >
                  <Link
                    to={Urls.newCollection("root")}
                    className="flex align-center"
                  >
                    <Icon name="all" mr={1} />
                    New collection
                  </Link>
                </li>
              </ol>
            </>
          </PopoverWithTrigger>
          {hasDataAccess && (
            <Link
              to="browse"
              className="flex align-center rounded transition-background mr3"
              data-metabase-event={`NavBar;Data Browse`}
            >
              <Icon name="table_spaced" size={14} p={"11px"} />
              <h4 className="hide sm-show text-nowrap">{t`Browse data`}</h4>
            </Link>
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
