"use strict";

import React, { Component, PropTypes } from "react";
import cx from "classnames";


export default class FormMessage extends Component {

    render() {
        let { className, formError, formSuccess, message } = this.props;

        const classes = cx('px2', className, {
            'text-success': formSuccess !== undefined,
            'text-error': formError !== undefined
        });

        if (!message) {
            if (formError && formError.data.message) {
                message = formError.data.message;
            } else if (formError && formError.status === 500) {
                // generic 500 without a specific message
                message = "Server error encountered";
            } else if (formSuccess && formSuccess.data.message) {
                message = formSuccess.data.message;
            }
        }

        if (message) {
            return (
                <span className={classes}>{message}</span>
            );
        } else {
            return null;
        }
    }
}
