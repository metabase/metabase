import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import UserSettings from "../components/UserSettings.jsx";
import { selectors } from "../selectors";


const mapStateToProps = (state, props) => {
    return {
        ...selectors(state),
        user: state.currentUser
    }
}

@connect(mapStateToProps)
export default class UserSettingsApp extends Component {
    render() {
        return <UserSettings {...this.props} />;
    }
}
