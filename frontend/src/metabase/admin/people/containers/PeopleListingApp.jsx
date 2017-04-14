/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import _ from "underscore";
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

import EditUserForm from "../components/EditUserForm.jsx";
import UserActionsSelect from "../components/UserActionsSelect.jsx";
import UserGroupSelect from "../components/UserGroupSelect.jsx";

export const MODAL_ADD_PERSON = 'MODAL_ADD_PERSON';
export const MODAL_EDIT_DETAILS = 'MODAL_EDIT_DETAILS';
export const MODAL_INVITE_RESENT = 'MODAL_INVITE_RESENT';
export const MODAL_REMOVE_USER = 'MODAL_REMOVE_USER';
export const MODAL_RESET_PASSWORD = 'MODAL_RESET_PASSWORD';
export const MODAL_RESET_PASSWORD_MANUAL = 'MODAL_RESET_PASSWORD_MANUAL';
export const MODAL_RESET_PASSWORD_EMAIL = 'MODAL_RESET_PASSWORD_EMAIL';
export const MODAL_USER_ADDED_WITH_INVITE = 'MODAL_USER_ADDED_WITH_INVITE';
export const MODAL_USER_ADDED_WITH_PASSWORD = 'MODAL_USER_ADDED_WITH_PASSWORD';

import { getUsers, getModal, getGroups } from "../selectors";
import {
    createUser,
    deleteUser,
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
        users: getUsers(state, props),
        modal: getModal(state, props),
        user: state.currentUser,
        groups: getGroups(state, props)
    }
}

const mapDispatchToProps = {
    createUser,
    deleteUser,
    fetchUsers,
    resetPasswordManually,
    resetPasswordViaEmail,
    showModal,
    updateUser,
    resendInvite,
    loadGroups,
    loadMemberships,
    createMembership,
    deleteMembership
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
        deleteUser: PropTypes.func.isRequired,
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
                this.props.loadMemberships()
            ]);
        } catch (error) {
            this.setState({ error });
        }
    }

    async onAddPerson(user) {
        // close the modal no matter what
        this.props.showModal(null);

        if (user) {
            let modal = MODAL_USER_ADDED_WITH_INVITE;

            // we assume invite style creation and tweak as needed if email not available
            if (!MetabaseSettings.isEmailConfigured()) {
                modal = MODAL_USER_ADDED_WITH_PASSWORD;
                user.password = MetabaseUtils.generatePassword();
            }

            // create the user
            this.props.createUser(user);

            // carry on
            this.props.showModal({
                type: modal,
                details: {
                    user: user
                }
            });
        }
    }

    onEditDetails(user) {
        // close the modal no matter what
        this.props.showModal(null);

        if (user) {
            this.props.updateUser(user);
        }
    }

    onPasswordResetConfirm(user) {
        if (MetabaseSettings.isEmailConfigured()) {
            // trigger password reset email
            this.props.resetPasswordViaEmail(user);

            // show confirmation modal
            this.props.showModal({
                type: MODAL_RESET_PASSWORD_EMAIL,
                details: {user: user}
            });

        } else {
            // generate a password
            const password = MetabaseUtils.generatePassword(14, MetabaseSettings.get('password_complexity'));

            // trigger the reset
            this.props.resetPasswordManually(user, password);

            // show confirmation modal
            this.props.showModal({
                type: MODAL_RESET_PASSWORD_MANUAL,
                details: {password: password, user: user}
            });
        }
    }

    onRemoveUserConfirm(user) {
        this.props.showModal(null);
        this.props.deleteUser(user);
    }

    onCloseModal = () => {
        this.props.showModal(null);
    }

    renderAddPersonModal(modalDetails) {
        return (
            <Modal title="Add Person" onClose={this.onCloseModal}>
                <EditUserForm
                    buttonText="Add Person"
                    submitFn={this.onAddPerson.bind(this)}
                    groups={this.props.groups}
                />
            </Modal>
        );
    }

    renderEditDetailsModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal full form title="Edit Details" onClose={this.onCloseModal}>
                <EditUserForm
                    user={user}
                    submitFn={this.onEditDetails.bind(this)}
                />
            </Modal>
        );
    }

    renderUserAddedWithPasswordModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal small
                title={user.first_name+" has been added"}
                footer={[
                    <Button onClick={() => this.props.showModal({type: MODAL_ADD_PERSON})}>Add another person</Button>,
                    <Button primary onClick={this.onCloseModal}>Done</Button>
                ]}
                onClose={this.onCloseModal}
            >
                <div className="px4 pb4">
                    <div className="pb4">We couldn’t send them an email invitation,
                    so make sure to tell them to log in using <span className="text-bold">{user.email} </span>
                    and this password we’ve generated for them:</div>

                    <PasswordReveal password={user.password} />

                    <div style={{paddingLeft: "5em", paddingRight: "5em"}} className="pt4 text-centered">If you want to be able to send email invites, just go to the <Link to="/admin/settings/email" className="link text-bold">Email Settings</Link> page.</div>
                </div>
            </Modal>
        );
    }

    renderUserAddedWithInviteModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal small
                title={user.first_name+" has been added"}
                footer={[
                    <Button onClick={() => this.props.showModal({type: MODAL_ADD_PERSON})}>Add another person</Button>,
                    <Button primary onClick={this.onCloseModal}>Done</Button>
                ]}
                onClose={this.onCloseModal}
            >
                <div style={{paddingLeft: "5em", paddingRight: "5em"}} className="pb4">We’ve sent an invite to <span className="text-bold">{user.email}</span> with instructions to set their password.</div>
            </Modal>
        );
    }

    renderInviteResentModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal small form
                title={"We've Re-sent "+user.first_name+"'s Invite"}
                footer={[
                    <Button primary onClick={this.onCloseModal}>Okay</Button>
                ]}
                onClose={this.onCloseModal}
            >
                <div>Any previous email invites they have will no longer work.</div>
            </Modal>
        );
    }

    renderRemoveUserModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal small
                title={"Remove "+user.common_name}
                footer={[
                    <Button onClick={this.onCloseModal}>Cancel</Button>,
                    <Button warning onClick={() => this.onRemoveUserConfirm(user)}>Remove</Button>
                ]}
                onClose={this.onCloseModal}
            >
                <div className="px4 pb4">
                    Are you sure you want to do this? {user.first_name} won't be able to log in anymore.  This can't be undone.
                </div>
            </Modal>
        );
    }

    renderResetPasswordModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal small
                title={"Reset "+user.first_name+"'s Password"}
                footer={[
                    <Button onClick={this.onCloseModal}>Cancel</Button>,
                    <Button warning onClick={() => this.onPasswordResetConfirm(user)}>Reset</Button>
                ]}
                onClose={this.onCloseModal}
            >
                <div className="px4 pb4">
                    Are you sure you want to do this?
                </div>
            </Modal>
        );
    }

    renderPasswordResetManuallyModal(modalDetails) {
        let { user, password } = modalDetails;

        return (
            <Modal small
                title={user.first_name+"'s Password Has Been Reset"}
                footer={<button className="Button Button--primary mr2" onClick={this.onCloseModal}>Done</button>}
                onClose={this.onCloseModal}
            >
                <div className="px4 pb4">
                    <span className="pb3 block">Here’s a temporary password they can use to log in and then change their password.</span>

                    <PasswordReveal password={password} />
                </div>
            </Modal>
        );
    }

    renderPasswordResetViaEmailModal(modalDetails) {
        let { user } = modalDetails;

        return (
            <Modal
                small
                title={user.first_name+"'s Password Has Been Reset"}
                footer={<Button primary onClick={this.onCloseModal}>Done</Button>}
                onClose={this.onCloseModal}
            >
                <div className="px4 pb4">We've sent them an email with instructions for creating a new password.</div>
            </Modal>
        );
    }

    renderModal(modalType, modalDetails) {

        switch(modalType) {
            case MODAL_ADD_PERSON:               return this.renderAddPersonModal(modalDetails);
            case MODAL_EDIT_DETAILS:             return this.renderEditDetailsModal(modalDetails);
            case MODAL_USER_ADDED_WITH_PASSWORD: return this.renderUserAddedWithPasswordModal(modalDetails);
            case MODAL_USER_ADDED_WITH_INVITE:   return this.renderUserAddedWithInviteModal(modalDetails);
            case MODAL_INVITE_RESENT:            return this.renderInviteResentModal(modalDetails);
            case MODAL_REMOVE_USER:              return this.renderRemoveUserModal(modalDetails);
            case MODAL_RESET_PASSWORD:           return this.renderResetPasswordModal(modalDetails);
            case MODAL_RESET_PASSWORD_MANUAL:    return this.renderPasswordResetManuallyModal(modalDetails);
            case MODAL_RESET_PASSWORD_EMAIL:     return this.renderPasswordResetViaEmailModal(modalDetails);
        }

        return null;
    }

    render() {
        let { modal, users, groups } = this.props;
        let { error } = this.state;

        users = _.values(users).sort((a, b) => (b.date_joined - a.date_joined));

        return (
            <LoadingAndErrorWrapper loading={!users} error={error}>
            {() =>
                <AdminPaneLayout
                    title="People"
                    buttonText="Add person"
                    buttonAction={() => this.props.showModal({type: MODAL_ADD_PERSON})}
                >
                    <section className="pb4">
                        <table className="ContentTable">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th></th>
                                    <th>Email</th>
                                    <th>Groups</th>
                                    <th>Last Login</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                { users.map(user =>
                                <tr key={user.id}>
                                    <td><span className="text-white inline-block"><UserAvatar background={(user.is_superuser) ? "bg-purple" : "bg-brand"} user={user} /></span> <span className="ml2 text-bold">{user.common_name}</span></td>
                                    <td>
                                      {user.google_auth ?
                                        <Tooltip tooltip="Signed up via Google">
                                            <Icon name='google' />
                                        </Tooltip> : null}
                                    </td>
                                    <td>{user.email}</td>
                                    <td>
                                        <UserGroupSelect
                                            user={user}
                                            groups={groups}
                                            createMembership={this.props.createMembership}
                                            deleteMembership={this.props.deleteMembership}
                                        />
                                    </td>
                                    <td>{ user.last_login ? user.last_login.fromNow() : "Never" }</td>
                                    <td className="text-right">
                                        <UserActionsSelect user={user} showModal={this.props.showModal} resendInvite={this.props.resendInvite} isActiveUser={this.props.user.id === user.id} />
                                    </td>
                                </tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                    { modal ? this.renderModal(modal.type, modal.details) : null }
                </AdminPaneLayout>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
