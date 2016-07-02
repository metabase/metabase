import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import AdminPeople from "../components/AdminPeople.jsx";
import { adminPeopleSelectors } from "../selectors";


const mapStateToProps = (state, props) => {
    return {
        ...adminPeopleSelectors(state),
        user: state.currentUser
    }
}

@connect(mapStateToProps)
export default class AdminPeopleApp extends Component {
    render() {
        return <AdminPeople {...this.props} />;
    }
}
