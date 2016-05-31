import React, { Component, PropTypes } from "react";

import cx from "classnames";

export default class FormField extends Component {
    static propTypes = {
        fieldName: PropTypes.string.isRequired
    };

    render() {
        let { children, className, fieldName, formError, error } = this.props;

        const classes = cx('Form-field', className, {
            'Form--fieldError': (error === true || (formError && formError.data.errors && fieldName in formError.data.errors))
        });

        return (
            <div className={classes}>
            	{children}
            </div>
        );
    }
}
