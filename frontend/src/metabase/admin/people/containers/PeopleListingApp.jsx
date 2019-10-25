/* @flow */
/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";
import moment from "moment";

import { color } from "metabase/lib/colors";

import * as Urls from "metabase/lib/urls";

import AdminPaneLayout from "metabase/components/AdminPaneLayout";
import EntityMenu from "metabase/components/EntityMenu";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Radio from "metabase/components/Radio";
import Tooltip from "metabase/components/Tooltip";
import UserAvatar from "metabase/components/UserAvatar";

import UserGroupSelect from "../components/UserGroupSelect";

import { loadMemberships, createMembership, deleteMembership } from "../people";
import {
  getSortedUsersWithMemberships,
  getGroupsWithoutMetabot,
} from "../selectors";
import { getUser } from "metabase/selectors/user";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";

// set outer loadingAndErrorWrapper to false to avoid conflicets. the second loader will handle that
@User.loadList({
  query: { include_deactivated: true },
  loadingAndErrorWrapper: false,
  wrapped: true,
  reload: true,
})
@Group.loadList()
@connect(
  (state, props) => ({
    user: getUser(state),
    users: getSortedUsersWithMemberships(state, props),
    groups: getGroupsWithoutMetabot(state, props),
  }),
  {
    loadMemberships,
    createMembership,
    deleteMembership,
  },
)
export default class PeopleListingApp extends Component {
  state = {};

  static propTypes = {
    user: PropTypes.object.isRequired,
    users: PropTypes.array,
    groups: PropTypes.array,
    loadMemberships: PropTypes.func.isRequired,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
    children: PropTypes.object,
  };

  // $FlowFixMe: expects return type void, not Promise<void>
  async componentDidMount() {
    try {
      await this.props.loadMemberships();
    } catch (error) {
      this.setState({ error });
    }
  }

  render() {
    let { user, users, groups } = this.props;
    let { showDeactivated } = this.state;

    const isCurrentUser = u => user && user.id === u.id;

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
                        bg={
                          user.is_superuser ? color("accent2") : color("brand")
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
                            <Link to={Urls.reactivateUser(user.id)}>
                              <Icon
                                name="refresh"
                                className="text-light text-brand-hover cursor-pointer"
                                size={20}
                              />
                            </Link>
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
                            isCurrentUser={isCurrentUser(user)}
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
                                link: Urls.editUser(user.id),
                              },
                              {
                                title: t`Reset password`,
                                link: Urls.resetPassword(user.id),
                              },
                              !isCurrentUser(user) && {
                                title: t`Deactivate user`,
                                link: Urls.deactivateUser(user.id),
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
