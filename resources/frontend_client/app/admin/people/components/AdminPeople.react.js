"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import MetabaseSettings from "metabase/lib/settings";
import MetabaseUtils from "metabase/lib/utils";
import Modal from "metabase/components/Modal.react";
import ModalContent from "metabase/components/ModalContent.react";
import UserAvatar from "metabase/components/UserAvatar.react";

import EditUserForm from "./EditUserForm.react";
import PasswordReveal from "./PasswordReveal.react";
import UserActionsSelect from "./UserActionsSelect.react";
import UserRoleSelect from "./UserRoleSelect.react";
import { createUser,
         fetchUsers,
         grantAdmin,
         resetPasswordManually,
         resetPasswordViaEmail,
         revokeAdmin,
         showModal,
         updateUser } from "../actions";


export const MODAL_ADD_PERSON = 'MODAL_ADD_PERSON';
export const MODAL_EDIT_DETAILS = 'MODAL_EDIT_DETAILS';
export const MODAL_INVITE_RESENT = 'MODAL_INVITE_RESENT';
export const MODAL_RESET_PASSWORD = 'MODAL_RESET_PASSWORD';
export const MODAL_RESET_PASSWORD_MANUAL = 'MODAL_RESET_PASSWORD_MANUAL';
export const MODAL_RESET_PASSWORD_EMAIL = 'MODAL_RESET_PASSWORD_EMAIL';
export const MODAL_USER_ADDED_WITH_INVITE = 'MODAL_USER_ADDED_WITH_INVITE';
export const MODAL_USER_ADDED_WITH_PASSWORD = 'MODAL_USER_ADDED_WITH_PASSWORD';


export default class AdminPeople extends Component {

    constructor(props) {
        super(props);

        this.state = { error: null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchUsers());
        } catch (error) {
            this.setState({ error });
        }
    }

    onRoleChange(user, roleDef) {
        if (roleDef.id === "user" && user.is_superuser) {
            this.props.dispatch(revokeAdmin(user));
        } else if (roleDef.id === "admin" && !user.is_superuser) {
            this.props.dispatch(grantAdmin(user));
        }
    }

    async onAddPerson(user) {
        // close the modal no matter what
        this.props.dispatch(showModal(null));

        if (user) {
            // time to create a new user!

            if (false && MetabaseSettings.isEmailConfigured()) {
                // when email available -> confirm that invitation was sent

                this.props.dispatch(createUser(user));

                this.props.dispatch(showModal({
                    type: MODAL_USER_ADDED_WITH_INVITE,
                    details: {
                        user: user
                    }
                }));

            } else {
                // if email is not setup -> generate temp password and allow user to retrieve it
                let autoPassword = MetabaseUtils.generatePassword();
                user.password = autoPassword;

                this.props.dispatch(createUser(user));

                this.props.dispatch(showModal({
                    type: MODAL_USER_ADDED_WITH_PASSWORD,
                    details: {
                        user: user
                    }
                }));
            }
        }
    }

    onEditDetails(user) {
        // close the modal no matter what
        this.props.dispatch(showModal(null));

        if (user) {
            this.props.dispatch(updateUser(user));
        }
    }

    onPasswordResetConfirm(user) {
        if (MetabaseSettings.isEmailConfigured()) {
            // trigger password reset email
            this.props.dispatch(resetPasswordViaEmail(user));
        } else {
            // manually set user password
            this.props.dispatch(resetPasswordManually(user));
        }
    }

    renderModal(modalType, modalDetails) {

        if (modalType === MODAL_ADD_PERSON) {

            return (
                <Modal>
                    <ModalContent title="Add Person"
                                  closeFn={() => this.props.dispatch(showModal(null))}>
                        <EditUserForm
                            buttonText="Add Person"
                            submitFn={this.onAddPerson.bind(this)} />
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_EDIT_DETAILS) {
            let { user } = modalDetails;

            return (
                <Modal>
                    <ModalContent title="Edit Details"
                                  closeFn={() => this.props.dispatch(showModal(null))}>
                        <EditUserForm
                            user={user}
                            submitFn={this.onEditDetails.bind(this)} />
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_USER_ADDED_WITH_PASSWORD) {
            let { user } = modalDetails;

            return (
                <Modal>
                    <ModalContent title={user.first_name+" has been added"}
                                  closeFn={() => this.props.dispatch(showModal(null))}>
                        <div>
                            <p>We couldn’t send them an email invitation,
                            so make sure to tell them to log in using <span className="text-bold">{user.email}</span>
                            and this password we’ve generated for them:</p>

                            <PasswordReveal password={user.password}></PasswordReveal>

                            <p>If you want to be able to send email invites, just go to the <a className="link" href="/admin/settings">Email Settings</a> page.</p>

                            <div className="Form-actions">
                                <button className="Button Button--primary mr2" onClick={() => this.props.dispatch(showModal(null))}>Done</button>
                                or <a className="link ml1 text-bold" href="" onClick={() => this.props.dispatch(showModal({type: MODAL_ADD_PERSON}))}>Add another person</a>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_USER_ADDED_WITH_INVITE) {
            let { user } = modalDetails;

            return (
                <Modal>
                    <ModalContent title={user.first_name+" has been added"}
                                  closeFn={() => this.props.dispatch(showModal(null))}>
                        <div>
                            <p>We’ve sent an invite to <span className="text-bold">{user.email}</span> with instructions to set their password.</p>

                            <div className="Form-actions">
                                <button className="Button Button--primary mr2" onClick={() => this.props.dispatch(showModal(null))}>Done</button>
                                or <a className="link ml1 text-bold" href="" onClick={() => this.props.dispatch(showModal({type: MODAL_ADD_PERSON}))}>Add another person</a>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_INVITE_RESENT) {
            let { user } = modalDetails;

            return (
                <Modal className="Modal Modal--small">
                    <ModalContent title={"We've Re-sent "+user.first_name+"'s Invite"}
                                  closeFn={() => this.props.dispatch(showModal(null))}
                                  className="Modal-content Modal-content--small NewForm">
                        <div>
                            <div className="px4 pb4">Any previous email invites they have will no longer work.</div>

                            <div className="Form-actions">
                                <button className="Button Button--primary mr2" onClick={() => this.props.dispatch(showModal(null))}>Okay</button>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        }  else if (modalType === MODAL_RESET_PASSWORD) {
            let { user } = modalDetails;

            return (
                <Modal className="Modal Modal--small">
                    <ModalContent title={"Reset "+user.first_name+"'s Password"}
                                  closeFn={() => this.props.dispatch(showModal(null))}
                                  className="Modal-content Modal-content--small NewForm">
                        <div>
                            <div className="px4 pb4">
                                Are you sure you want to do this?
                            </div>

                            <div className="Form-actions">
                                <button className="Button Button--warning" onClick={() => this.onPasswordResetConfirm(user)}>Yes</button>
                                <button className="Button Button--primary ml2" onClick={() => this.props.dispatch(showModal(null))}>No</button>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_RESET_PASSWORD_MANUAL) {
            let { user, password } = modalDetails;

            return (
                <Modal className="Modal Modal--small">
                    <ModalContent title={user.first_name+"'s Password Has Been Reset"}
                                  closeFn={() => this.props.dispatch(showModal(null))}
                                  className="Modal-content Modal-content--small NewForm">
                        <div>
                            <div className="px4 pb4">
                                <span className="pb3 block">Here’s a temporary password they can use to log in and then change their password.</span>

                                <PasswordReveal password={password}></PasswordReveal>
                            </div>

                            <div className="Form-actions">
                                <button className="Button Button--primary mr2" onClick={() => this.props.dispatch(showModal(null))}>Done</button>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        } else if (modalType === MODAL_RESET_PASSWORD_EMAIL) {
            let { user } = modalDetails;

            return (
                <Modal className="Modal Modal--small">
                    <ModalContent title={user.first_name+"'s Password Has Been Reset"}
                                  closeFn={() => this.props.dispatch(showModal(null))}
                                  className="Modal-content Modal-content--small NewForm">
                        <div>
                            <div className="px4 pb4">We've sent them an email with instructions for creating a new password.</div>

                            <div className="Form-actions">
                                <button className="Button Button--primary mr2" onClick={() => this.props.dispatch(showModal(null))}>Done</button>
                            </div>
                        </div>
                    </ModalContent>
                </Modal>
            );

        }
    }

    render() {
        let users = _.values(this.props.users);
        let { modal } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!users} error={error}>
            {() =>
                <div className="wrapper">
                    { modal ? this.renderModal(modal.type, modal.details) : null }

                    <section className="PageHeader clearfix">
                        <a className="Button Button--primary float-right" href="#" onClick={() => this.props.dispatch(showModal({type: MODAL_ADD_PERSON}))}>Add person</a>
                        <h2 className="PageTitle">People</h2>
                    </section>

                    <section>
                        <table className="ContentTable">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Role</th>
                                    <th>Last Seen</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                { users.map(user =>
                                <tr>
                                    <td><span className="text-white inline-block"><UserAvatar background={(user.is_superuser) ? "bg-purple" : "bg-brand"} user={user} /></span> <span className="ml2 text-bold">{user.common_name}</span></td>
                                    <td>{user.email}</td>
                                    <td>
                                        <UserRoleSelect
                                            user={user}
                                            onChangeFn={this.onRoleChange.bind(this)} />
                                    </td>
                                    <td>{ user.last_login ? user.last_login.fromNow() : "Never" }</td>
                                    <td className="text-right">
                                        <UserActionsSelect user={user} dispatch={this.props.dispatch} />
                                    </td>
                                </tr>
                                )}
                            </tbody>
                        </table>
                    </section>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}

AdminPeople.propTypes = {
    dispatch: PropTypes.func.isRequired,
    users: PropTypes.array
};
