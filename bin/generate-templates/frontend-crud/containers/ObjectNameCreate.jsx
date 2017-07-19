import React, { Component } from "react";
import { connect } from "react-redux";
import { push } from "react-router-redux";

import ${ObjectName}Form from "./${ObjectName}Form.jsx";

import { create${ObjectName} } from "../duck";

const mapStateToProps = (state, props) => ({
    ${object_name}: null,
    error: state.${object_name}.error,
});

const mapDispatchToProps = {
    create${ObjectName},
    onClose: () => push("/${object_name}")
}

@connect(mapStateToProps, mapDispatchToProps)
export default class ${ObjectName}Create extends Component {

    handleSubmit = (${object_name}) => {
        this.props.create${ObjectName}(${object_name});
        this.props.onClose();
    }

    render() {
        return (
            <${ObjectName}Form
                {...this.props}
                onSubmit={this.handleSubmit}
            />
        );
    }
}
