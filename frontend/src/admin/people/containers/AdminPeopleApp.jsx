import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import AdminPeople from "../components/AdminPeople.jsx";
import { adminPeopleSelectors } from "../selectors";

@connect(adminPeopleSelectors)
export default class AdminPeopleApp extends Component {
    render() {
        return <AdminPeople {...this.props} />;
    }
}
