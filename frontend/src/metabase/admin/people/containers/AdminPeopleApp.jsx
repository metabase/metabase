/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import AdminPeople from "../components/AdminPeople.jsx";
import { adminPeopleSelectors } from "../selectors";
import {
    createUser,
    deleteUser,
    fetchUsers,
    grantAdmin,
    resetPasswordManually,
    resetPasswordViaEmail,
    revokeAdmin,
    showModal,
    updateUser,
    resendInvite
} from "../actions";

const mapStateToProps = (state, props) => {
    return {
        ...adminPeopleSelectors(state),
        user: state.currentUser
    }
}

const mapDispatchToProps = {
    createUser,
    deleteUser,
    fetchUsers,
    grantAdmin,
    resetPasswordManually,
    resetPasswordViaEmail,
    revokeAdmin,
    showModal,
    updateUser,
    resendInvite
};

@connect(mapStateToProps, mapDispatchToProps)
export default class AdminPeopleApp extends Component {
    render() {
        return <AdminPeople {...this.props} />;
    }
}
