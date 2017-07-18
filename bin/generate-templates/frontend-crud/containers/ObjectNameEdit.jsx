import React, { Component } from "react";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import ${ObjectName}Form from "./${ObjectName}Form.jsx";

import { update${ObjectName}, load${ObjectName} } from "../duck";

const mapStateToProps = (state, props) => ({
    ${object_name}: state.${object_name}.${object_name_plural}[props.params.id],
    error: state.${object_name}.error,
});

const mapDispatchToProps = {
    load${ObjectName},
    update${ObjectName},
    onClose: goBack
};

@connect(mapStateToProps, mapDispatchToProps)
export default class ${ObjectName}Edit extends Component {

    componentWillMount() {
        this.props.load${ObjectName}(this.props.params.id);
    }

    handleSubmit = (${object_name}) => {
        this.props.update${ObjectName}(${object_name});
        this.props.onClose();
    }

    render() {
        return (
            <${ObjectName}Form
                {...this.props}
                onSubmit={this.handleSubmit}
                initialValues={this.props.${object_name}}
            />
        );
    }
}
