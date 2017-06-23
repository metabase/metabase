/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import ReactDOM from "react-dom";

import FormField from "metabase/components/form/FormField.jsx";
import FormLabel from "metabase/components/form/FormLabel.jsx";
import GroupSelect from "../components/GroupSelect.jsx";
import GroupSummary from "../components/GroupSummary.jsx";

import MetabaseUtils from "metabase/lib/utils";
import SelectButton from "metabase/components/SelectButton.jsx";
import Toggle from "metabase/components/Toggle.jsx";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.jsx";
import Button from "metabase/components/Button.jsx";
import { ModalFooter } from "metabase/components/ModalContent.jsx";

import _ from "underscore";

import { isAdminGroup, canEditMembership } from "metabase/lib/groups";

export default class EditUserForm extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            formError: null,
            valid: false,
            selectedGroups: {}
        }
    }

    static propTypes = {
        buttonText: PropTypes.string,
        submitFn: PropTypes.func.isRequired,
        user: PropTypes.object,
        groups: PropTypes.array
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

        this.props.submitFn({
            ...(this.props.user || {}),
            first_name: ReactDOM.findDOMNode(this.refs.firstName).value,
            last_name: ReactDOM.findDOMNode(this.refs.lastName).value,
            email: email,
            groups: this.props.groups && this.state.selectedGroups ?
                Object.entries(this.state.selectedGroups).filter(([key, value]) => value).map(([key, value]) => parseInt(key, 10)) :
                null
        });
    }

    cancel() {
        this.props.submitFn(null);
    }

    render() {
        const { buttonText, user, groups } = this.props;
        const { formError, valid, selectedGroups } = this.state;

        const adminGroup = _.find(groups, isAdminGroup);

        return (
            <form onSubmit={this.formSubmitted.bind(this)} noValidate>
                <div className="px4 pb2">
                    <FormField fieldName="first_name" formError={formError}>
                        <FormLabel title="First name" fieldName="first_name" formError={formError} offset={false}></FormLabel>
                        <input ref="firstName" className="Form-input full" name="firstName" defaultValue={(user) ? user.first_name : null} placeholder="Johnny" onChange={this.onChange.bind(this)} />
                    </FormField>

                    <FormField fieldName="last_name" formError={formError}>
                        <FormLabel title="Last name" fieldName="last_name" formError={formError} offset={false}></FormLabel>
                        <input ref="lastName" className="Form-input full" name="lastName" defaultValue={(user) ? user.last_name : null} placeholder="Appleseed" required onChange={this.onChange.bind(this)} />
                    </FormField>

                    <FormField fieldName="email" formError={formError}>
                        <FormLabel title="Email address" fieldName="email" formError={formError} offset={false}></FormLabel>
                        <input ref="email" className="Form-input full" name="email" defaultValue={(user) ? user.email : null} placeholder="youlooknicetoday@email.com" required onChange={this.onChange.bind(this)} />
                    </FormField>

                    { groups && groups.filter(g => canEditMembership(g) && !isAdminGroup(g)).length > 0 ?
                        <FormField>
                            <FormLabel title="Permission Groups" offset={false}></FormLabel>
                            <PopoverWithTrigger
                                sizeToFit
                                triggerElement={
                                    <SelectButton>
                                        <GroupSummary groups={groups} selectedGroups={selectedGroups}/>
                                    </SelectButton>
                                }
                            >
                                <GroupSelect
                                    groups={groups}
                                    selectedGroups={selectedGroups}
                                    onGroupChange={(group, selected) => {
                                        this.setState({ selectedGroups: { ...selectedGroups, [group.id]: selected }})
                                    }}
                                />
                            </PopoverWithTrigger>
                        </FormField>
                    : adminGroup ?
                        <div className="flex align-center">
                            <Toggle
                                value={selectedGroups[adminGroup.id]}
                                onChange={(isAdmin) => {
                                    this.setState({ selectedGroups: isAdmin ? { [adminGroup.id]: true } : {} })
                                }}
                            />
                            <span className="ml2">Make this user an admin</span>
                        </div>
                    : null }
                </div>

                <ModalFooter>
                    <Button type="button" onClick={this.cancel.bind(this)}>
                        Cancel
                    </Button>
                    <Button primary disabled={!valid}>
                        { buttonText ? buttonText : "Save Changes" }
                    </Button>
                </ModalFooter>
            </form>
        );
    }
}
