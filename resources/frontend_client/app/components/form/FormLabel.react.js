"use strict";

import React, { Component, PropTypes } from "react";


export default class FormLabel extends Component {

    render() {
        let { fieldName, formError, message, title } = this.props;

        if (!message) {
            message = (formError && formError.data.errors && fieldName in formError.data.errors) ? formError.data.errors[fieldName] : undefined;
        }

        return (
            <label className="Form-label Form-offset">{title}: { message !== undefined ? <span>{message}</span> : null }</label>
        );
    }
}

FormLabel.propTypes = {
    fieldName: PropTypes.string.isRequired,
    formError: PropTypes.object,
    message: PropTypes.string,
    title: PropTypes.string.isRequired
}
