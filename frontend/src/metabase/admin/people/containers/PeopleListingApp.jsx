/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { connect } from "react-redux";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import AdminPaneLayout from "metabase/components/AdminPaneLayout.jsx";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import Modal from "metabase/components/Modal.jsx";
import PasswordReveal from "metabase/components/PasswordReveal.jsx";
import UserAvatar from "metabase/components/UserAvatar.jsx";
import Icon from "metabase/components/Icon.jsx";
import Tooltip from "metabase/components/Tooltip.jsx";
import Button from "metabase/components/Button.jsx";
import Radio from "metabase/components/Radio";

import { t, jt } from "c-3po";
import _ from "underscore";
import moment from "moment";
import EditUserForm from "../components/EditUserForm.jsx";
import UserActionsSelect from "../components/UserActionsSelect.jsx";
import UserGroupSelect from "../components/UserGroupSelect.jsx";

export const MODAL_ADD_PERSON = "MODAL_ADD_PERSON";
export const MODAL_EDIT_DETAILS = "MODAL_EDIT_DETAILS";
export const MODAL_INVITE_RESENT = "MODAL_INVITE_RESENT";
export const MODAL_DEACTVIATE_USER = "MODAL_DEACTVIATE_USER";
export const MODAL_REACTIVATE_USER = "MODAL_REACTIVATE_USER";
export const MODAL_RESET_PASSWORD = "MODAL_RESET_PASSWORD";
export const MODAL_RESET_PASSWORD_MANUAL = "MODAL_RESET_PASSWORD_MANUAL";
export const MODAL_RESET_PASSWORD_EMAIL = "MODAL_RESET_PASSWORD_EMAIL";
export const MODAL_USER_ADDED_WITH_INVITE = "MODAL_USER_ADDED_WITH_INVITE";
export const MODAL_USER_ADDED_WITH_PASSWORD = "MODAL_USER_ADDED_WITH_PASSWORD";

import { getSortedUsers, getModal, getGroups } from "../selectors";
import {
  createUser,
  deactivateUser,
  reactivateUser,
  fetchUsers,
  resetPasswordManually,
  resetPasswordViaEmail,
  showModal,
  updateUser,
  resendInvite,
  loadGroups,
  loadMemberships,
  createMembership,
  deleteMembership,
} from "../people";

const mapStateToProps = (state, props) => {
  return {
    users: getSortedUsers(state, props),
    modal: getModal(state, props),
    user: state.currentUser,
    groups: getGroups(state, props),
  };
};

const mapDispatchToProps = {
  createUser,
  deactivateUser,
  reactivateUser,
  fetchUsers,
  resetPasswordManually,
  resetPasswordViaEmail,
  showModal,
  updateUser,
  resendInvite,
  loadGroups,
  loadMemberships,
  createMembership,
  deleteMembership,
};

@connect(mapStateToProps, mapDispatchToProps)
export default class PeopleListingApp extends Component {
  constructor(props, context) {
    super(props, context);

    this.state = { error: null };
  }

  static propTypes = {
    user: PropTypes.object.isRequired,
    users: PropTypes.object,
    groups: PropTypes.array,
    modal: PropTypes.object,
    createUser: PropTypes.func.isRequired,
    deactivateUser: PropTypes.func.isRequired,
    reactivateUser: PropTypes.func.isRequired,
    fetchUsers: PropTypes.func.isRequired,
    resetPasswordManually: PropTypes.func.isRequired,
    resetPasswordViaEmail: PropTypes.func.isRequired,
    showModal: PropTypes.func.isRequired,
    updateUser: PropTypes.func.isRequired,
    resendInvite: PropTypes.func.isRequired,
    loadGroups: PropTypes.func.isRequired,
    loadMemberships: PropTypes.func.isRequired,
    createMembership: PropTypes.func.isRequired,
    deleteMembership: PropTypes.func.isRequired,
  };

  async componentDidMount() {
    try {
      await Promise.all([
        this.props.fetchUsers(),
        this.props.loadGroups(),
        this.props.loadMemberships(),
      ]);
    } catch (error) {
      this.setState({ error });
    }
  }

  onAddPerson = async user => {
    if (user) {
      let modal = MODAL_USER_ADDED_WITH_INVITE;

      // we assume invite style creation and tweak as needed if email not available
      if (!MetabaseSettings.isEmailConfigured()) {
        modal = MODAL_USER_ADDED_WITH_PASSWORD;
        user.password = MetabaseUtils.generatePassword();
      }

      // create the user
      await this.props.createUser(user);

      // carry on
      this.props.showModal({
        type: modal,
        details: {
          user: user,
        },
      });
    } else {
      this.props.showModal(null);
    }
  };

  onEditDetails = async user => {
    if (user) {
      await this.props.updateUser(user);
    }
    this.props.showModal(null);
  };

  onPasswordResetConfirm(user) {
    if (MetabaseSettings.isEmailConfigured()) {
      // trigger password reset email
      this.props.resetPasswordViaEmail(user);

      // show confirmation modal
      this.props.showModal({
        type: MODAL_RESET_PASSWORD_EMAIL,
        details: { user: user },
      });
    } else {
      // generate a password
      const password = MetabaseUtils.generatePassword();

      // trigger the reset
      this.props.resetPasswordManually(user, password);

      // show confirmation modal
      this.props.showModal({
        type: MODAL_RESET_PASSWORD_MANUAL,
        details: { password: password, user: user },
      });
    }
  }

  onDeactivateUserConfirm(user) {
    this.props.showModal(null);
    this.props.deactivateUser(user);
  }

  onReactivateUserConfirm(user) {
    this.props.showModal(null);
    this.props.reactivateUser(user);
  }

  onCloseModal = () => {
    this.props.showModal(null);
  };

  renderAddPersonModal(modalDetails) {
    return (
      <Modal title={t`Who do you want to add?`} onClose={this.onCloseModal}>
        <EditUserForm
          buttonText={t`Add`}
          submitFn={this.onAddPerson}
          groups={this.props.groups}
        />
      </Modal>
    );
  }

  renderEditDetailsModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        title={t`Edit ${user.first_name}'s details`}
        onClose={this.onCloseModal}
      >
        <EditUserForm user={user} submitFn={this.onEditDetails} />
      </Modal>
    );
  }

  renderUserAddedWithPasswordModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        title={t`${user.first_name} has been added`}
        footer={[
          <Button
            onClick={() => this.props.showModal({ type: MODAL_ADD_PERSON })}
          >{t`Add another person`}</Button>,
          <Button primary onClick={this.onCloseModal}>{t`Done`}</Button>,
        ]}
        formModal
        onClose={this.onCloseModal}
      >
        <div>
          <div className="pb4">{jt`We couldn’t send them an email invitation,
                    so make sure to tell them to log in using ${(
                      <span className="text-bold">{user.email}</span>
                    )}
                    and this password we’ve generated for them:`}</div>

          <PasswordReveal password={user.password} />

          <div
            style={{ paddingLeft: "5em", paddingRight: "5em" }}
            className="pt4 text-centered"
          >{jt`If you want to be able to send email invites, just go to the ${(
            <Link to="/admin/settings/email" className="link text-bold">
              Email Settings
            </Link>
          )} page.`}</div>
        </div>
      </Modal>
    );
  }

  renderUserAddedWithInviteModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        title={t`${user.first_name} has been added`}
        footer={[
          <Button
            onClick={() => this.props.showModal({ type: MODAL_ADD_PERSON })}
          >{t`Add another person`}</Button>,
          <Button primary onClick={this.onCloseModal}>{t`Done`}</Button>,
        ]}
        onClose={this.onCloseModal}
      >
        <div className="pb4">
          {jt`We’ve sent an invite to ${(
            <span className="text-bold">{user.email}</span>
          )} with instructions to set their password.`}
        </div>
      </Modal>
    );
  }

  renderInviteResentModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        form
        title={t`We've re-sent ${user.first_name}'s invite`}
        footer={[
          <Button primary onClick={this.onCloseModal}>{t`Okay`}</Button>,
        ]}
        onClose={this.onCloseModal}
      >
        <p className="text-paragraph pb2">{t`Any previous email invites they have will no longer work.`}</p>
      </Modal>
    );
  }

  renderDeactivateUserModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        title={t`Deactivate ${user.common_name}?`}
        footer={[
          <Button onClick={this.onCloseModal}>{t`Cancel`}</Button>,
          <Button danger onClick={() => this.onDeactivateUserConfirm(user)}>
            {t`Deactivate`}
          </Button>,
        ]}
        onClose={this.onCloseModal}
      >
        {t`${user.first_name} won't be able to log in anymore.`}
      </Modal>
    );
  }

  renderReactivateUserModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        title={t`Reactivate ${user.common_name}'s account?`}
        footer={[
          <Button onClick={this.onCloseModal}>{t`Cancel`}</Button>,
          <Button
            primary
            onClick={() => this.onReactivateUserConfirm(user)}
          >{t`Reactivate`}</Button>,
        ]}
        onClose={this.onCloseModal}
      >
        {t`They'll be able to log in again, and they'll be placed back into the groups they were in before their account was deactivated.`}
      </Modal>
    );
  }

  renderResetPasswordModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        title={t`Reset ${user.first_name}'s password?`}
        footer={[
          <Button onClick={this.onCloseModal}>{t`Cancel`}</Button>,
          <Button
            warning
            onClick={() => this.onPasswordResetConfirm(user)}
          >{t`Reset`}</Button>,
        ]}
        onClose={this.onCloseModal}
      >
        {t`Are you sure you want to do this?`}
      </Modal>
    );
  }

  renderPasswordResetManuallyModal(modalDetails) {
    let { user, password } = modalDetails;

    return (
      <Modal
        small
        title={t`${user.first_name}'s password has been reset`}
        footer={
          <button
            className="Button Button--primary"
            onClick={this.onCloseModal}
          >{t`Done`}</button>
        }
        onClose={this.onCloseModal}
      >
        <span className="pb3 block">{t`Here’s a temporary password they can use to log in and then change their password.`}</span>

        <PasswordReveal password={password} />
      </Modal>
    );
  }

  renderPasswordResetViaEmailModal(modalDetails) {
    let { user } = modalDetails;

    return (
      <Modal
        small
        title={t`${user.first_name}'s password has been reset`}
        footer={<Button primary onClick={this.onCloseModal}>{t`Done`}</Button>}
        onClose={this.onCloseModal}
      >
        {t`We've sent them an email with instructions for creating a new password.`}
      </Modal>
    );
  }

  renderModal(modalType, modalDetails) {
    switch (modalType) {
      case MODAL_ADD_PERSON:
        return this.renderAddPersonModal(modalDetails);
      case MODAL_EDIT_DETAILS:
        return this.renderEditDetailsModal(modalDetails);
      case MODAL_USER_ADDED_WITH_PASSWORD:
        return this.renderUserAddedWithPasswordModal(modalDetails);
      case MODAL_USER_ADDED_WITH_INVITE:
        return this.renderUserAddedWithInviteModal(modalDetails);
      case MODAL_INVITE_RESENT:
        return this.renderInviteResentModal(modalDetails);
      case MODAL_DEACTVIATE_USER:
        return this.renderDeactivateUserModal(modalDetails);
      case MODAL_REACTIVATE_USER:
        return this.renderReactivateUserModal(modalDetails);
      case MODAL_RESET_PASSWORD:
        return this.renderResetPasswordModal(modalDetails);
      case MODAL_RESET_PASSWORD_MANUAL:
        return this.renderPasswordResetManuallyModal(modalDetails);
      case MODAL_RESET_PASSWORD_EMAIL:
        return this.renderPasswordResetViaEmailModal(modalDetails);
    }

    return null;
  }

  render() {
    let { modal, users, groups } = this.props;
    let { error, showDeactivated } = this.state;

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
        <Radio
          className="h6"
          value={!!showDeactivated}
          options={[
            { name: t`Active`, value: false },
            { name: t`Deactivated`, value: true },
          ]}
          onChange={showDeactivated => this.setState({ showDeactivated })}
        />
      );
    }

    return (
      <LoadingAndErrorWrapper loading={!users} error={error}>
        {() => (
          <AdminPaneLayout
            title={title}
            buttonText={showDeactivated ? null : t`Add someone`}
            buttonAction={() =>
              this.props.showModal({ type: MODAL_ADD_PERSON })
            }
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
                        <span className="ml2 text-bold">
                          {user.common_name}
                        </span>
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
                                  onClick={() =>
                                    this.props.showModal({
                                      type: MODAL_REACTIVATE_USER,
                                      details: { user },
                                    })
                                  }
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
                              <UserActionsSelect
                                user={user}
                                showModal={this.props.showModal}
                                resendInvite={this.props.resendInvite}
                                isActiveUser={this.props.user.id === user.id}
                              />
                            </td>,
                          ]}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
            {modal ? this.renderModal(modal.type, modal.details) : null}
          </AdminPaneLayout>
        )}
      </LoadingAndErrorWrapper>
    );
  }
}
