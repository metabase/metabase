"use strict";

import React, { Component, PropTypes } from "react";


export default class FormLabel extends Component {

    render() {
        let { fieldName, formError, help, title } = this.props;
        const message = (formError && formError.data.errors && fieldName in formError.data.errors) ? formError.data.errors[fieldName] : undefined;

        return (
            <label className="Form-label Form-offset">{title}: {help !== undefined ? help : null} { message !== undefined ? <span>{message}</span> : null }</label>
        );
    }
}

FormLabel.propTypes = {
    fieldName: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired
}
