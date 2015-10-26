import React, { Component, PropTypes } from "react";
import cx from "classnames";


export default class FormMessage extends Component {

    render() {
        let { className, formError, formSuccess, message } = this.props;

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

        const classes = cx('Form-message', 'px2', className, {
            'Form-message--visible': !!message,
            'text-success': formSuccess !== undefined,
            'text-error': formError !== undefined
        });
        
        return (
            <span className={classes}>{message}</span>
        );
    }
}
