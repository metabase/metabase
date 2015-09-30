"use strict";

import React, { Component, PropTypes } from "react";
import _ from "underscore";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import Modal from "metabase/components/Modal.react";
import ModalContent from "metabase/components/ModalContent.react";
import UserAvatar from "metabase/components/UserAvatar.react";

import EditUserForm from "./EditUserForm.react";
import UserActionsSelect from "./UserActionsSelect.react";
import UserRoleSelect from "./UserRoleSelect.react";
import { createUser,
         fetchUsers,
         grantAdmin,
         revokeAdmin,
         showAddPersonModal,
         showEditDetailsModal,
         updateUser } from "../actions";


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

    onAddPerson(user) {
        // close the modal no matter what
        this.props.dispatch(showAddPersonModal(null));

        if (user) {
            // time to create a new user!

            // if email is not setup -> generate temp password and allow user to retrieve it
            // when email available -> confirm that invitation was sent

            this.props.dispatch(createUser(user));
        }
    }

    renderAddPersonModal() {
        if (!this.props.showAddPersonModal) return false;

        return (
            <Modal>
                <ModalContent title="Add Person"
                              closeFn={() => this.props.dispatch(showAddPersonModal(false))}>
                    <EditUserForm
                        buttonText="Add Person"
                        submitFn={this.onAddPerson.bind(this)} />
                </ModalContent>
            </Modal>
        );
    }

    onEditDetails(user) {
        // close the modal no matter what
        this.props.dispatch(showEditDetailsModal(null));

        if (user) {
            this.props.dispatch(updateUser(user));
        }
    }

    renderEditDetailsModal() {
        if (!this.props.showEditDetailsModal) return false;

        return (
            <Modal>
                <ModalContent title="Edit Details"
                              closeFn={() => this.props.dispatch(showEditDetailsModal(null))}>
                    <EditUserForm
                        user={this.props.showEditDetailsModal}
                        submitFn={this.onEditDetails.bind(this)} />
                </ModalContent>
            </Modal>
        );
    }

    render() {
        let users = _.values(this.props.users);
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper loading={!users} error={error}>
            {() =>
                <div className="wrapper">
                    {this.renderAddPersonModal()}
                    {this.renderEditDetailsModal()}

                    <section className="PageHeader clearfix">
                        <a className="Button Button--primary float-right" href="#" onClick={() => this.props.dispatch(showAddPersonModal(true))}>Add person</a>
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
                                    <td>{user.last_login.fromNow()}</td>
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
