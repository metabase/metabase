'use strict';

import FormField from "metabase/components/FormField.react";
import Icon from "metabase/components/Icon.react";
import ModalBody from "metabase/components/ModalBody.react";

import Query from "metabase/lib/query";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "SaveQuestionModal",
    propTypes: {
        card: React.PropTypes.object.isRequired,
        tableMetadata: React.PropTypes.object, // can't be required, sometimes null
        saveFn: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            errors: null
        };
    },

    isFormReady: function() {
        // TODO: make this work properly
        return true;
    },

    save: function(event) {
        event.preventDefault();

        // make sure that user put in a card name before we close out the form
        var name = this.refs.name.getDOMNode().value.trim();
        if (!name || name === "") {
            this.setState({
                errors: {
                    data: {
                        errors: {
                            name: "This is a required field"
                        }
                    }
                }
            });

            return;
        }

        var card = this.props.card;
        card.name = this.refs.name.getDOMNode().value.trim();
        card.description = this.refs.description.getDOMNode().value.trim();
        card.public_perms = 2; // public read/write

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
    },

    render: function() {
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
            "Button--primary": this.isFormReady()
        });

        var name = this.props.card.name || Query.generateQueryDescription(this.props.card.dataset_query, this.props.tableMetadata);

        return (
            <ModalBody
                title="Save Question"
                closeFn={this.props.closeFn}
            >
                <form className="NewForm full" onSubmit={this.save}>
                    <div className="Form-inputs">
                        <FormField
                            displayName="Name"
                            fieldName="name"
                            errors={this.state.errors}>
                            <input ref="name" className="Form-input full" name="name" placeholder="What is the name of your card?" defaultValue={name} autofocus/>
                        </FormField>

                        <FormField
                            displayName="Description (optional)"
                            fieldName="description"
                            errors={this.state.errors}>
                            <textarea ref="description" className="Form-input full" name="description" placeholder="It's optional but oh, so helpful" defaultValue={this.props.card.description} />
                        </FormField>
                    </div>

                    <div className="Form-actions">
                        <button className={buttonClasses}>
                            Save
                        </button>
                        <span className="px1">or</span><a href="#" className="no-decoration text-brand text-bold" onClick={this.props.closeFn}>Cancel</a>
                        {formError}
                    </div>
                </form>
            </ModalBody>
        );
    },
});
