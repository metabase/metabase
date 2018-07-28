/* @flow */
/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "c-3po";
import _ from "underscore";
import moment from "moment";

import * as Urls from "metabase/lib/urls";

import Users from "metabase/entities/users";

import AdminPaneLayout from "metabase/components/AdminPaneLayout.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Radio from "metabase/components/Radio";
import { entityListLoader } from "metabase/entities/containers/EntityListLoader";

import EntityMenu from "metabase/components/EntityMenu";

import UserGroupSelect from "../components/UserGroupSelect.jsx";

export const MODAL_INVITE_RESENT = "MODAL_INVITE_RESENT";
export const MODAL_DEACTVIATE_USER = "MODAL_DEACTVIATE_USER";
export const MODAL_REACTIVATE_USER = "MODAL_REACTIVATE_USER";
export const MODAL_RESET_PASSWORD = "MODAL_RESET_PASSWORD";
export const MODAL_RESET_PASSWORD_MANUAL = "MODAL_RESET_PASSWORD_MANUAL";
export const MODAL_RESET_PASSWORD_EMAIL = "MODAL_RESET_PASSWORD_EMAIL";
export const MODAL_USER_ADDED_WITH_INVITE = "MODAL_USER_ADDED_WITH_INVITE";
export const MODAL_USER_ADDED_WITH_PASSWORD = "MODAL_USER_ADDED_WITH_PASSWORD";

import {
  reactivateUser,
  resetPasswordManually,
  resetPasswordViaEmail,
  resendInvite,
  loadGroups,
  loadMemberships,
  createMembership,
  deleteMembership,
} from "../people";

const mapStateToProps = (state, props) => {
  return {
    users: props.users,
    user: state.currentUser,
    groups: props.groups,
  };
};

const mapDispatchToProps = {
  deactivateUser: Users.actions.delete,
  reactivateUser,
  resetPasswordManually,
  resetPasswordViaEmail,
  resendInvite,
  loadGroups,
  loadMemberships,
  createMembership,
  deleteMembership,
};

@entityListLoader({ entityType: "users" })
@connect(mapStateToProps, mapDispatchToProps)
export default class PeopleListingApp extends Component {
  state = {
    showDeactivated: false,
  };

  static propTypes = {
    user: PropTypes.object.isRequired,
    users: PropTypes.array,
    groups: PropTypes.array,
    deactivateUser: PropTypes.func.isRequired,
    reactivateUser: PropTypes.func.isRequired,
    resendInvite: PropTypes.func.isRequired,
    loadGroups: PropTypes.func.isRequired,
    loadMemberships: PropTypes.func.isRequired,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
    children: PropTypes.object,
  };

  async componentDidMount() {
    try {
      await Promise.all([
        this.props.loadGroups(),
        this.props.loadMemberships(),
      ]);
    } catch (error) {}
  }

  render() {
    let { users, groups } = this.props;
    let { showDeactivated } = this.state;

    // TODO - this should be done in connect
    users = _.values(users).sort((a, b) => b.date_joined - a.date_joined);

    const [active, deactivated] = _.partition(users, user => user.is_active);
    if (deactivated.length === 0) {
      showDeactivated = false;
    } else if (active.length === 0) {
      showDeactivated = true;
    }

    users = showDeactivated ? deactivated : active;

    let title = t`People`;
    if (deactivated.length > 0) {
      title = (
        <div className="mb2">
          <Radio
            className="h6"
            value={!!showDeactivated}
            options={[
              { name: t`Active`, value: false },
              { name: t`Deactivated`, value: true },
            ]}
            underlined
            py={1}
            onChange={showDeactivated => this.setState({ showDeactivated })}
          />
        </div>
      );
    }

    return (
      <AdminPaneLayout
        title={title}
        buttonText={showDeactivated ? null : t`Add someone`}
        buttonLink={Urls.newUser()}
      >
        <section className="pb4">
          <table className="ContentTable">
            <thead>
              <tr>
                <th>{t`Name`}</th>
                <th />
                <th>{t`Email`}</th>
                {showDeactivated
                  ? [
                      <th key="deactivated_at">{t`Deactivated`}</th>,
                      <th key="actions" />,
                    ]
                  : [
                      <th key="groups">{t`Groups`}</th>,
                      <th key="last_login">{t`Last Login`}</th>,
                      <th key="actions" />,
                    ]}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}>
                  <td>
                    <span className="text-white inline-block">
                      <UserAvatar
                        background={
                          user.is_superuser ? "bg-purple" : "bg-brand"
                        }
                        user={user}
                      />
                    </span>{" "}
                    <span className="ml2 text-bold">{user.common_name}</span>
                  </td>
                  <td>
                    {user.google_auth ? (
                      <Tooltip tooltip={t`Signed up via Google`}>
                        <Icon name="google" />
                      </Tooltip>
                    ) : null}
                    {user.ldap_auth ? (
                      <Tooltip tooltip={t`Signed up via LDAP`}>
                        <Icon name="ldap" />
                      </Tooltip>
                    ) : null}
                  </td>
                  <td>{user.email}</td>
                  {showDeactivated
                    ? [
                        <td key="deactivated_at">
                          {moment(user.updated_at).fromNow()}
                        </td>,
                        <td key="actions">
                          <Tooltip tooltip={t`Reactivate this account`}>
                            <Icon
                              name="refresh"
                              className="text-light text-brand-hover cursor-pointer"
                              size={20}
                              onClick={() => console.log("reactivate")}
                            />
                          </Tooltip>
                        </td>,
                      ]
                    : [
                        <td key="groups">
                          <UserGroupSelect
                            user={user}
                            groups={groups}
                            createMembership={this.props.createMembership}
                            deleteMembership={this.props.deleteMembership}
                          />
                        </td>,
                        <td key="last_login">
                          {user.last_login
                            ? moment(user.last_login).fromNow()
                            : t`Never`}
                        </td>,
                        <td key="actions" className="text-right">
                          <EntityMenu
                            triggerIcon="ellipsis"
                            items={[
                              {
                                title: t`Edit user`,
                                icon: null,
                                link: Urls.editUser(user.id),
                              },
                              {
                                title: t`Reset password`,
                                icon: null,
                                link: Urls.resetPassword(user.id),
                              },
                              {
                                title: t`Deactivate user`,
                                icon: null,
                                action: () =>
                                  this.props.deactivateUser(user.id),
                              },
                            ]}
                          />
                        </td>,
                      ]}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        {this.props.children}
      </AdminPaneLayout>
    );
  }
}
