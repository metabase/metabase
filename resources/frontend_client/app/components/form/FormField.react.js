"use strict";

import React, { Component, PropTypes } from "react";
import cx from "classnames";


export default class FormField extends Component {

    render() {
        let { children, className, fieldName, formError } = this.props;

        const classes = cx('Form-field', className, {
            'Form--fieldError': (formError && formError.data.errors && fieldName in formError.data.errors)
        });

        return (
            <div className={classes}>
            	{children}
            </div>
        );
    }
}

FormField.propTypes = {
    fieldName: PropTypes.string.isRequired
}
