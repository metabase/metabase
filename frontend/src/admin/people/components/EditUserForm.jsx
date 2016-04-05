import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";

import MetabaseUtils from "metabase/lib/utils";

import _ from "underscore";
import cx from "classnames";

export default class EditUserForm extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = { formError: null, valid: false }
    }

    static propTypes = {
        buttonText: PropTypes.string,
        submitFn: PropTypes.func.isRequired,
        user: PropTypes.object
    };

    validateForm() {
        let { valid } = this.state;
        let isValid = true;

        // required: first_name, last_name, email
        for (var fieldName in this.refs) {
            let node = ReactDOM.findDOMNode(this.refs[fieldName]);
            if (node.required && MetabaseUtils.isEmpty(node.value)) isValid = false;
        }

        if(isValid !== valid) {
            this.setState({
                'valid': isValid
            });
        }
    }

    onChange() {
        this.validateForm();
    }

    formSubmitted(e) {
        e.preventDefault();

        this.setState({
            formError: null
        });

        let formErrors = {data:{errors:{}}};

        // validate email address
        let email = ReactDOM.findDOMNode(this.refs.email).value ? ReactDOM.findDOMNode(this.refs.email).value.trim() : null;
        if (!MetabaseUtils.validEmail(email)) {
            formErrors.data.errors.email = "Not a valid formatted email address";
        }

        if (_.keys(formErrors.data.errors).length > 0) {
            this.setState({
                formError: formErrors
            });
            return;
        }

        let user = (this.props.user) ? _.clone(this.props.user) : {};

        user.first_name = ReactDOM.findDOMNode(this.refs.firstName).value;
        user.last_name = ReactDOM.findDOMNode(this.refs.lastName).value;
        user.email = email;

        this.props.submitFn(user);
    }

    cancel() {
        this.props.submitFn(null);
    }

    render() {
        const { buttonText, user } = this.props;
        const { formError, valid } = this.state;

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <div className="px4 pb2">
                    <FormField fieldName="first_name" formError={formError}>
                        <FormLabel title="First name" fieldName="first_name" formError={formError} offset={false}></FormLabel>
                        <input ref="firstName" className="Form-input full" name="name" defaultValue={(user) ? user.first_name : null} placeholder="Johnny" onChange={this.onChange.bind(this)} />
                    </FormField>

                    <FormField fieldName="last_name" formError={formError}>
                        <FormLabel title="Last name" fieldName="last_name" formError={formError} offset={false}></FormLabel>
                        <input ref="lastName" className="Form-input full" name="name" defaultValue={(user) ? user.last_name : null} placeholder="Appleseed" required onChange={this.onChange.bind(this)} />
                    </FormField>

                    <FormField fieldName="email" formError={formError}>
                        <FormLabel title="Email address" fieldName="email" formError={formError} offset={false}></FormLabel>
                        <input ref="email" className="Form-input full" name="email" defaultValue={(user) ? user.email : null} placeholder="youlooknicetoday@email.com" required onChange={this.onChange.bind(this)} />
                    </FormField>
                </div>

                <div className="Form-actions">
                    <button className={cx("Button", {"Button--primary": valid})} disabled={!valid}>
                        { buttonText ? buttonText : "Save Changes" }
                    </button>
                    <span className="pl1">or<a className="link ml1 text-bold" href="" onClick={this.cancel.bind(this)}>Cancel</a></span>
                </div>
            </form>
        );
    }
}
