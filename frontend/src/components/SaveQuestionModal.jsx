import React, { Component, PropTypes } from "react";

import FormField from "metabase/components/FormField.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import Query from "metabase/lib/query";

import cx from "classnames";


export default class SaveQuestionModal extends Component {

    constructor(props, context) {
        super(props, context);
        this.state = {
            errors: null,
            valid: false,
            details: {
                name: props.card ? props.card.name : null,
                description: props.card ? props.card.description : null,
                saveType: "create"
            }
        };
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        originalCard: PropTypes.object,
        tableMetadata: PropTypes.object, // can't be required, sometimes null
        createFn: PropTypes.func.isRequired,
        saveFn: PropTypes.func.isRequired,
        closeFn: PropTypes.func.isRequired
    }

    componentDidMount() {
        this.validateForm();
    }

    componentDidUpdate() {
        this.validateForm();
    }

    validateForm() {
        let { details } = this.state;

        let valid = true;

        // name is required
        if (!details.name) {
            valid = false;
        }

        if (this.state.valid !== valid) {
            this.setState({ valid });
        }
    }

    onChange(fieldName, fieldValue) {
        this.setState({ details: { ...this.state.details, [fieldName]: fieldValue ? fieldValue.trim() : null }});
    }

    formSubmitted(e) {
        e.preventDefault();

        let { details } = this.state;
        let card = this.props.card;

        card.name = details.name;
        card.description = details.description;
        card.public_perms = 2; // public read/write

        if (details.saveType === "create") {
            this.props.createFn(card).then((success) => {
                if (this.isMounted()) {
                    this.props.closeFn();
                }
            }, (error) => {
                if (this.isMounted()) {
                    this.setState({
                        errors: error
                    });
                }
            });
        } else if (details.saveType === "overwrite") {
            card.id = this.props.originalCard.id;
            this.props.saveFn(card).then((success) => {
                if (this.isMounted()) {
                    this.props.closeFn();
                }
            }, (error) => {
                if (this.isMounted()) {
                    this.setState({
                        errors: error
                    });
                }
            });
        }
    }

    render() {
        var formError;
        if (this.state.errors) {
            var errorMessage;
            if (this.state.errors.status === 500) {
                errorMessage = "Server error encountered";
            }

            if (this.state.errors.data &&
                this.state.errors.data.message) {
                errorMessage = this.state.errors.data.message;
            }

            // TODO: timeout display?
            if (errorMessage) {
                formError = (
                    <span className="text-error px2">{errorMessage}</span>
                );
            }
        }

        var buttonClasses = cx({
            "Button": true,
            "Button--primary": this.state.valid
        });

        var name = this.props.card.name || Query.generateQueryDescription(this.props.tableMetadata, this.props.card.dataset_query.query);

        var saveOrUpdate = null;
        if (!this.props.card.id && this.props.originalCard) {
            saveOrUpdate = (
                <FormField
                    displayName="Save or Replace?"
                    fieldName="saveType"
                    errors={this.state.errors}>
                    <ul>
                        <li><input type="radio" name="saveType" value="create" checked={this.state.details.saveType === "create"} onChange={(e) => this.onChange("saveType", e.target.value)} /> Save as a new question?</li>
                        <li><input type="radio" name="saveType" value="overwrite" checked={this.state.details.saveType === "overwrite"} onChange={(e) => this.onChange("saveType", e.target.value)} /> Replace original question, "{this.props.originalCard.name}"</li>
                    </ul>
                </FormField>
            );
        }

        return (
            <ModalContent
                title="Save Question"
                closeFn={this.props.closeFn}
            >
                <form className="flex flex-column flex-full" onSubmit={(e) => this.formSubmitted(e)}>
                    <div className="Form-inputs">
                        {saveOrUpdate}

                        <FormField
                            displayName="Name"
                            fieldName="name"
                            errors={this.state.errors}>
                            <input className="Form-input full" name="name" placeholder="What is the name of your card?" defaultValue={name} onChange={(e) => this.onChange("name", e.target.value)} autofocus/>
                        </FormField>

                        <FormField
                            displayName="Description (optional)"
                            fieldName="description"
                            errors={this.state.errors}>
                            <textarea className="Form-input full" name="description" placeholder="It's optional but oh, so helpful" defaultValue={this.props.card.description} onChange={(e) => this.onChange("description", e.target.value)} />
                        </FormField>
                    </div>

                    <div className="Form-actions">
                        <button className={buttonClasses} disabled={!this.state.valid}>
                            Save
                        </button>
                        <span className="px1">or</span><a className="no-decoration text-brand text-bold" onClick={this.props.closeFn}>Cancel</a>
                        {formError}
                    </div>
                </form>
            </ModalContent>
        );
    }
}
