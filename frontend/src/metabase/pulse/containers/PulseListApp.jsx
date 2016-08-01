import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

import PulseList from "../components/PulseList.jsx";
import { listPulseSelectors } from "../selectors";


const mapStateToProps = (state, props) => {
    return {
        ...listPulseSelectors(state, props),
        user: state.currentUser,
        // onChangeLocation: onChangeLocation
    }
}

@connect(mapStateToProps)
export default class PulseListApp extends Component {
    render() {
        return (
            <PulseList { ...this.props } />
        );
    }
}
