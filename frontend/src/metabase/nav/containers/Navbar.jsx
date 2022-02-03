/* eslint-disable react/prop-types */
import React, { Component } from "react";
import PropTypes from "prop-types";

import { connect } from "react-redux";
import { push } from "react-router-redux";

import { t } from "ttag";

import * as Urls from "metabase/lib/urls";
import { color, darken } from "metabase/lib/colors";

import EntityMenu from "metabase/components/EntityMenu";
import Icon from "metabase/components/Icon";
import Link from "metabase/core/components/Link";
import LogoIcon from "metabase/components/LogoIcon";
import Modal from "metabase/components/Modal";

import ProfileLink from "metabase/nav/components/ProfileLink";
import SearchBar from "metabase/nav/components/SearchBar";

import CollectionCreate from "metabase/collections/containers/CollectionCreate";
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
import {
  EntityMenuContainer,
  LogoIconContainer,
  LogoLinkContainer,
  NavRoot,
  SearchBarContainer,
  SearchBarContent,
} from "./Navbar.styled";

const mapDispatchToProps = {
  onChangeLocation: push,
};

const MODAL_NEW_DASHBOARD = "MODAL_NEW_DASHBOARD";
const MODAL_NEW_COLLECTION = "MODAL_NEW_COLLECTION";

@Database.loadList({
  // set this to false to prevent a potential spinner on the main nav
  loadingAndErrorWrapper: false,
})
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
      <NavRoot
        // NOTE: DO NOT REMOVE `Nav` CLASS FOR NOW, USED BY MODALS, FULLSCREEN DASHBOARD, ETC
        // TODO: hide nav using state in redux instead?
        className="Nav relative bg-brand text-white z3 flex-no-shrink"
      >
        <LogoLinkContainer>
          <Link
            to="/"
            data-metabase-event={"Navbar;Logo"}
            className="relative cursor-pointer z2 rounded flex justify-center transition-background"
            p={1}
            mx={1}
            hover={{ backgroundColor: getDefaultSearchColor() }}
          >
            <LogoIconContainer>
              <LogoIcon dark height={32} />
            </LogoIconContainer>
          </Link>
        </LogoLinkContainer>
        <SearchBarContainer>
          <SearchBarContent>
            <SearchBar
              location={this.props.location}
              onChangeLocation={this.props.onChangeLocation}
            />
          </SearchBarContent>
        </SearchBarContainer>
        <EntityMenuContainer>
          <EntityMenu
            className="hide sm-show mr1"
            trigger={
              <Link
                mr={1}
                p={1}
                hover={{
                  backgroundColor: darken(color("brand")),
                }}
                className="flex align-center rounded transition-background"
                data-metabase-event={`NavBar;Create Menu Click`}
              >
                <Icon name="add" size={14} />
                <h4 className="hide sm-show ml1 text-nowrap">{t`New`}</h4>
              </Link>
            }
            items={[
              ...(hasDataAccess
                ? [
                    {
                      title: t`Question`,
                      icon: `insight`,
                      link: Urls.newQuestion({
                        mode: "notebook",
                        creationType: "custom_question",
                      }),
                      event: `NavBar;New Question Click;`,
                    },
                  ]
                : []),
              ...(hasNativeWrite
                ? [
                    {
                      title: t`SQL query`,
                      icon: `sql`,
                      link: Urls.newQuestion({
                        type: "native",
                        creationType: "native_question",
                      }),
                      event: `NavBar;New SQL Query Click;`,
                    },
                  ]
                : []),
              {
                title: t`Dashboard`,
                icon: `dashboard`,
                action: () => this.setModal(MODAL_NEW_DASHBOARD),
                event: `NavBar;New Dashboard Click;`,
              },
              {
                title: t`Collection`,
                icon: `folder`,
                action: () => this.setModal(MODAL_NEW_COLLECTION),
                event: `NavBar;New Collection Click;`,
              },
            ]}
          />

          {hasDataAccess && (
            <Link
              mr={[1, 2]}
              to="browse"
              p={1}
              hover={{
                backgroundColor: darken(color("brand")),
              }}
              className="flex align-center rounded transition-background"
              data-metabase-event={`NavBar;Data Browse`}
            >
              <Icon name="table_spaced" size={14} />
              <h4 className="hide sm-show ml1 text-nowrap">{t`Browse data`}</h4>
            </Link>
          )}
          <ProfileLink {...this.props} />
        </EntityMenuContainer>
        {this.renderModal()}
      </NavRoot>
    );
  }

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

  renderModal() {
    const { modal } = this.state;

    if (modal) {
      return (
        <Modal onClose={() => this.setState({ modal: null })}>
          {this.renderModalContent()}
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
