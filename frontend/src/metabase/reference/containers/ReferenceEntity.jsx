/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { connect } from "react-redux";

const mapStateToProps = (state, props) => {
    return {};
};

const mapDispatchToProps = {

};

@connect(mapStateToProps, mapDispatchToProps)
export default class EntityItem extends Component {
    render() {
        return (
            <div></div>
        )
    }
}
