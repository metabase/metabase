import React, { Component, PropTypes } from "react";

import FormField from "metabase/components/FormField.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import Query from "metabase/lib/query";
import { cancelable } from "metabase/lib/promise";

import cx from "classnames";


export default class SaveQuestionModal extends Component {

    constructor(props, context) {
        super(props, context);

        const isStructured = Query.isStructured(props.card.dataset_query);

        this.state = {
            error: null,
            valid: false,
            details: {
                name: props.card.name || isStructured ? Query.generateQueryDescription(props.tableMetadata, props.card.dataset_query.query) : "",
                description: props.card.description || null,
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

    componentWillUnmount() {
        if (this.requestPromise) {
            this.requestPromise.cancel();
        }
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
        if (fieldName === "saveType" && fieldValue === "overwrite" && this.state.details.saveType !== "overwrite") {
            // when someone chooses overwrite we want to populate the name/description from the original card
            this.setState({
                details: {
                    name: this.props.originalCard.name,
                    description: this.props.originalCard.description,
                    saveType: "overwrite"
                }
            });
        } else {
            this.setState({ details: { ...this.state.details, [fieldName]: fieldValue ? fieldValue : null }});
        }
    }

    formSubmitted(e) {
        e.preventDefault();

        let { details } = this.state;
        let { card, addToDashboard, createFn, saveFn } = this.props;

        card.name = details.name.trim();
        // since description is optional, it can be null, so check for a description before trimming it
        card.description = details.description ? details.description.trim() : null;
        card.public_perms = 2; // public read/write

        if (details.saveType === "create") {
            this.requestPromise = cancelable(createFn(card, addToDashboard));
        } else if (details.saveType === "overwrite") {
            card.id = this.props.originalCard.id;
            this.requestPromise = cancelable(saveFn(card, addToDashboard));
        }

        this.requestPromise.then((success) => {
            this.props.closeFn();
        }).catch((error) => {
            if (!error.isCanceled) {
                this.setState({ error: error });
            }
        });
    }

    render() {
        let { error } = this.state;
        var formError;
        if (error) {
            var errorMessage;
            if (error.status === 500) {
                errorMessage = "Server error encountered";
            }

            if (error.data && error.data.message) {
                errorMessage = error.data.message;
            }
            if (error.data && error.data.errors) {
                errorMessage = Object.values(error.data.errors);
            }

            // TODO: timeout display?
            if (errorMessage) {
                formError = (
                    <span className="text-error px2">{errorMessage}</span>
                );
            }
        }

        var saveOrUpdate = null;
        if (!this.props.card.id && this.props.originalCard) {
            saveOrUpdate = (
                <FormField
                    displayName="Save or Replace?"
                    fieldName="saveType"
                    errors={this.state.errors}>
                    <ul>
                        <li onClick={(e) => this.onChange("saveType", "create")}><input type="radio" name="saveType" value="create" checked={this.state.details.saveType === "create"} /> Save as a new question?</li>
                        <li onClick={(e) => this.onChange("saveType", "overwrite")}><input type="radio" name="saveType" value="overwrite" checked={this.state.details.saveType === "overwrite"} /> Replace original question, "{this.props.originalCard.name}"</li>
                    </ul>
                </FormField>
            );
        }

        let title = this.props.addToDashboard ? "First, Save Your Question" : "Save Question";

        return (
            <ModalContent
                title={title}
                closeFn={this.props.closeFn}
            >
                <form className="flex flex-column flex-full" onSubmit={(e) => this.formSubmitted(e)}>
                    <div className="Form-inputs">
                        {saveOrUpdate}

                        <FormField
                            displayName="Name"
                            fieldName="name"
                            errors={this.state.errors}>
                            <input className="Form-input full" name="name" placeholder="What is the name of your card?" value={this.state.details.name} onChange={(e) => this.onChange("name", e.target.value)} autoFocus/>
                        </FormField>

                        <FormField
                            displayName="Description (optional)"
                            fieldName="description"
                            errors={this.state.errors}>
                            <textarea className="Form-input full" name="description" placeholder="It's optional but oh, so helpful" value={this.state.details.description} onChange={(e) => this.onChange("description", e.target.value)} />
                        </FormField>
                    </div>

                    <div className="Form-actions">
                        <button className={cx("Button", { "Button--primary": this.state.valid })} disabled={!this.state.valid}>
                            Save
                        </button>
                        <span className="px1">or</span>
                        <a className="no-decoration text-brand text-bold" onClick={this.props.closeFn}>Cancel</a>
                        {formError}
                    </div>
                </form>
            </ModalContent>
        );
    }
}
