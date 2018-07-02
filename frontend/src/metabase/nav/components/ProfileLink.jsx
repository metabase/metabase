import React, { Component } from "react";
import PropTypes from "prop-types";
import { Box } from "grid-styled";

import { t } from "c-3po";
import _ from "underscore";
import { capitalize } from "metabase/lib/formatting";

import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";
import Modal from "metabase/components/Modal";
import Logs from "metabase/components/Logs";

import LogoIcon from "metabase/components/LogoIcon";
import EntityMenu from "metabase/components/EntityMenu";

export default class ProfileLink extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = {
      dropdownOpen: false,
      modalOpen: null,
    };

    _.bindAll(
      this,
      "toggleDropdown",
      "closeDropdown",
      "openModal",
      "closeModal",
    );
  }

  static propTypes = {
    user: PropTypes.object.isRequired,
    context: PropTypes.string.isRequired,
  };

  toggleDropdown() {
    this.setState({ dropdownOpen: !this.state.dropdownOpen });
  }

  closeDropdown() {
    this.setState({ dropdownOpen: false });
  }

  openModal(modalName) {
    this.setState({ dropdownOpen: false, modalOpen: modalName });
  }

  closeModal() {
    this.setState({ modalOpen: null });
  }

  render() {
    const { user, context } = this.props;
    const { modalOpen } = this.state;
    const { tag, date, ...versionExtra } = MetabaseSettings.get("version");
    const isRoot = user.is_superuser;
    const admin = context === "admin";
    return (
      <Box>
        <EntityMenu
          items={[
            {
              title: t`Account settings`,
              icon: null,
              link: Urls.accountSettings(),
            },
            {
              title: admin ? t`Exit admin` : t`Admin`,
              icon: null,
              link: admin ? "/" : "/admin",
            },
            {
              title: t`Logs`,
              icon: null,
              action: () => this.openModal("logs"),
            },
            {
              title: t`About metabase`,
              icon: null,
              action: () => this.openModal("about"),
            },
            {
              title: t`Sign out`,
              icon: null,
              link: "auth/logout",
            },
          ]}
          triggerIcon="person"
        />
        {modalOpen === "about" ? (
          <Modal small onClose={this.closeModal}>
            <div className="px4 pt4 pb2 text-centered relative">
              <div className="text-brand pb2">
                <LogoIcon width={48} height={48} />
              </div>
              <h2 style={{ fontSize: "1.75em" }} className="text-dark">
                {t`Thanks for using`} Metabase!
              </h2>
              <div className="pt2">
                <h3 className="text-dark mb1">
                  {t`You're on version`} {tag}
                </h3>
                <p className="text-grey-3 text-bold">
                  {t`Built on`} {date}
                </p>
                {!/^v\d+\.\d+\.\d+$/.test(tag) && (
                  <div>
                    {_.map(versionExtra, (value, key) => (
                      <p key={key} className="text-grey-3 text-bold">
                        {capitalize(key)}: {value}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div
              style={{ borderWidth: "2px" }}
              className="p2 h5 text-centered text-grey-3 border-top"
            >
              <span className="block">
                <span className="text-bold">Metabase</span>{" "}
                {t`is a Trademark of`} Metabase, Inc
              </span>
              <span>{t`and is built with care in San Francisco, CA`}</span>
            </div>
          </Modal>
        ) : modalOpen === "logs" ? (
          <Modal wide onClose={this.closeModal}>
            <Logs onClose={this.closeModal} />
          </Modal>
        ) : null}
      </Box>
      /*
      <PopoverWithTrigger
        triggerElement={
          <a
            data-metabase-event={"Navbar;Profile Dropdown;Toggle"}
            className="flex align-center p2 transition-background"
            onClick={this.toggleDropdown}
          >
          </a>
        }
      >
            <div>
              <ul>
                {!user.google_auth && !user.ldap_auth ? (
                  <li>
                    <Link
                      to="/user/edit_current"
                      data-metabase-event={
                        "Navbar;Profile Dropdown;Edit Profile"
                      }
                      onClick={this.closeDropdown}
                      className="Dropdown-item block  no-decoration"
                    >
                      {t`Account Settings`}
                    </Link>
                  </li>
                ) : null}

                {user.is_superuser && context !== "admin" ? (
                  <li>
                    <Link
                      to="/admin"
                      data-metabase-event={
                        "Navbar;Profile Dropdown;Enter Admin"
                      }
                      onClick={this.closeDropdown}
                      className="Dropdown-item block  no-decoration"
                    >
                      {t`Admin Panel`}
                    </Link>
                  </li>
                ) : null}

                {user.is_superuser && context === "admin" ? (
                  <li>
                    <Link
                      to="/"
                      data-metabase-event={"Navbar;Profile Dropdown;Exit Admin"}
                      onClick={this.closeDropdown}
                      className="Dropdown-item block  no-decoration"
                    >
                      {t`Exit Admin`}
                    </Link>
                  </li>
                ) : null}

                <li>
                  <a
                    data-metabase-event={"Navbar;Profile Dropdown;Help " + tag}
                    className="Dropdown-item block  no-decoration"
                    href={"http://www.metabase.com/docs/" + tag}
                    target="_blank"
                  >
                    {t`Help`}
                  </a>
                </li>

                {user.is_superuser && (
                    <a
                      data-metabase-event={
                        "Navbar;Profile Dropdown;Debugging " + tag
                      }
                      onClick={this.openModal.bind(this, "logs")}
                      className="Dropdown-item block  no-decoration"
                    >
                      {t`Logs`}
                    </a>

                  <a
                    data-metabase-event={"Navbar;Profile Dropdown;About " + tag}
                    onClick={this.openModal.bind(this, "about")}
                    className="Dropdown-item block  no-decoration"
                  >
                    {t`About Metabase`}
                  </a>

                  <Link
                    to="/auth/logout"
                    data-metabase-event={"Navbar;Profile Dropdown;Logout"}
                  >
                    {t`Sign out`}
                  </Link>
      */
    );
  }
}
