import React, { Component } from "react";
import PropTypes from "prop-types";
import { connect } from "react-redux";
import { t, ngettext, msgid } from "ttag";
import moment from "moment";
import _ from "underscore";

import { color } from "metabase/lib/colors";

import * as Urls from "metabase/lib/urls";

import EntityMenu from "metabase/components/EntityMenu";
import Icon from "metabase/components/Icon";
import Link from "metabase/components/Link";
import Tooltip from "metabase/components/Tooltip";
import UserAvatar from "metabase/components/UserAvatar";
import PaginationControls from "metabase/components/PaginationControls";
import { getUser } from "metabase/selectors/user";

import User from "metabase/entities/users";
import Group from "metabase/entities/groups";

import UserGroupSelect from "../components/UserGroupSelect";
import { USER_STATUS } from "../constants";
import { loadMemberships } from "../people";

@Group.loadList({
  reload: true,
})
@User.loadList({
  reload: true,
  query: (_, { query }) => ({
    query: query.searchText,
    status: query.status,
    limit: query.pageSize,
    offset: query.pageSize * query.page,
  }),
})
@connect(
  state => ({
    user: getUser(state),
  }),
  {
    loadMemberships,
  },
)
export default class PeopleList extends Component {
  state = {};

  static propTypes = {
    query: PropTypes.shape({
      searchText: PropTypes.string.isRequired,
      status: PropTypes.string.isRequired,
      page: PropTypes.number.isRequired,
      pageSize: PropTypes.number.isRequired,
    }),
    user: PropTypes.object.isRequired,
    users: PropTypes.array,
    groups: PropTypes.array,
    loadMemberships: PropTypes.func.isRequired,
    onNextPage: PropTypes.func,
    onPreviousPage: PropTypes.func,
    reload: PropTypes.func.isRequired,
    metadata: PropTypes.shape({
      total: PropTypes.number.isRequired,
    }).isRequired,
  };

  componentDidMount() {
    this.props.loadMemberships();
  }

  reloadIfUserActivityChanged(prevUsers, users) {
    const areSameUsers = _.isEqual(
      prevUsers.map(u => u.id),
      users.map(u => u.id),
    );

    if (!areSameUsers) {
      return;
    }

    const isActivityChanged = !_.isEqual(
      prevUsers.map(u => u.is_active),
      users.map(u => u.is_active),
    );

    if (isActivityChanged) {
      this.props.reload();
    }
  }

  componentDidUpdate(prevProps) {
    this.reloadIfUserActivityChanged(prevProps.users, this.props.users);
  }

  render() {
    const {
      user,
      users,
      groups,
      query,
      metadata,
      onNextPage,
      onPreviousPage,
    } = this.props;
    const { total } = metadata;

    const { page, pageSize, status } = query;

    const isCurrentUser = u => user && user.id === u.id;
    const showDeactivated = status === USER_STATUS.deactivated;
    const hasUsers = users.length > 0;

    return (
      <section className="pb4">
        <table className="ContentTable border-bottom">
          <thead>
            <tr>
              <th>{t`Name`}</th>
              <th />
              <th>{t`Email`}</th>
              {showDeactivated ? (
                <React.Fragment>
                  <th>{t`Deactivated`}</th>
                  <th />
                </React.Fragment>
              ) : (
                <React.Fragment>
                  <th>{t`Groups`}</th>
                  <th>{t`Last Login`}</th>
                  <th />
                </React.Fragment>
              )}
            </tr>
          </thead>
          <tbody>
            {hasUsers &&
              users.map(user => (
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
                  {showDeactivated ? (
                    <React.Fragment>
                      <td>{moment(user.updated_at).fromNow()}</td>
                      <td>
                        <Tooltip tooltip={t`Reactivate this account`}>
                          <Link to={Urls.reactivateUser(user.id)}>
                            <Icon
                              name="refresh"
                              className="text-light text-brand-hover cursor-pointer"
                              size={20}
                            />
                          </Link>
                        </Tooltip>
                      </td>
                    </React.Fragment>
                  ) : (
                    <React.Fragment>
                      <td>
                        <UserGroupSelect
                          groups={groups}
                          userId={user.id}
                          isCurrentUser={isCurrentUser(user)}
                        />
                      </td>
                      <td>
                        {user.last_login
                          ? moment(user.last_login).fromNow()
                          : t`Never`}
                      </td>
                      <td className="text-right">
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
                      </td>
                    </React.Fragment>
                  )}
                </tr>
              ))}
          </tbody>
        </table>

        {hasUsers && (
          <div className="flex align-center justify-between p2">
            <div className="text-medium text-bold">
              {ngettext(
                msgid`${total} person found`,
                `${total} people found`,
                total,
              )}
            </div>
            <PaginationControls
              page={page}
              pageSize={pageSize}
              total={total}
              itemsLength={users.length}
              onNextPage={onNextPage}
              onPreviousPage={onPreviousPage}
            />
          </div>
        )}

        {!hasUsers && (
          <div className="flex flex-column align-center justify-center p4 text-medium text-centered">
            <div className="my3">
              <Icon name="search" mb={1} size={32} />
              <h3 className="text-light">{t`No results found`}</h3>
            </div>
          </div>
        )}
      </section>
    );
  }
}
