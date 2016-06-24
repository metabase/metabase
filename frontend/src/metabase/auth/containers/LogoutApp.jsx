import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import * as authActions from "../auth";


const mapStateToProps = (state, props) => {
    return {
        user:             state.currentUser,
        onChangeLocation: props.onChangeLocation
    }
}

const mapDispatchToProps = {
    ...authActions
}

@connect(mapStateToProps, mapDispatchToProps)
export default class LogoutApp extends Component {

    componentWillMount() {
        this.props.logout(this.props.onChangeLocation);
    }

    render() {
        return null;
    }
}
