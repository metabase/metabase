'use strict';
/*global OnClickOutside*/

import FormField from './form_field.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'Saver',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        saveFn: React.PropTypes.func.isRequired
    },
    mixins: [OnClickOutside],

    getDefaultProps: function() {
        return {
            buttonText: "Edit",
            saveButtonText: "Save",
            className: 'Button Button--primary'
        };
    },

    getInitialState: function() {
        return {
            modalOpen: false,
            errors: null
        };
    },

    handleClickOutside: function() {
        this.replaceState(this.getInitialState());
    },

    toggleModal: function() {
        var modalOpen = !this.state.modalOpen;
        this.setState({
            modalOpen: modalOpen
        }, function () {
            // focus the name field
            this.refs.name.getDOMNode().focus();
        });
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
        card.public_perms = parseInt(this.refs.public_perms.getDOMNode().value);

        var component = this;
        this.props.saveFn(card).then(function(success) {
            component.setState({
                modalOpen: false
            });
        }, function(error) {
            component.setState({
                errors: error
            });
        });
    },

    renderCardSaveForm: function() {
        if (!this.state.modalOpen) {
            return false;
        }

        // TODO: hard coding values :(
        var privacyOptions = [
            (<option key="0" value={0}>Private</option>),
            (<option key="1" value={1}>Public (others can read)</option>)
        ];

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

        return (
            <form className="Form-new" onSubmit={this.save}>
                <FormField
                    displayName="Name"
                    fieldName="name"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="name" className="Form-input Form-offset full" name="name" placeholder="What is the name of your card?" defaultValue={this.props.card.name} autofocus/>
                </FormField>

                <FormField
                    displayName="Description (optional)"
                    fieldName="description"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="description" className="Form-input Form-offset full" name="description" placeholder="What else should people know about this?" defaultValue={this.props.card.description} />
                </FormField>

                <FormField
                    displayName="Privacy"
                    fieldName="public_perms"
                    showCharm={false}
                    errors={this.state.errors}>
                    <label className="Select Form-offset">
                        <select ref="public_perms" defaultValue={this.props.card.public_perms}>
                            {privacyOptions}
                        </select>
                    </label>
                </FormField>

                <div className="Form-actions">
                    <button className={buttonClasses}>
                        {this.props.saveButtonText}
                    </button>
                    <a className="ml1" href="#" onClick={this.toggleModal}>
                        Cancel
                    </a>
                    {formError}
                </div>
            </form>
        );
    },

    render: function() {
        var modalClasses = cx({
            'SaveModal': true,
            'Modal--showing': this.state.modalOpen,
        });

        return (
            <div>
                <div className={modalClasses}>
                    <div className="ModalContent">
                        {this.renderCardSaveForm()}
                    </div>
                </div>
                <a className={this.props.className} onClick={this.toggleModal}>{this.props.buttonText}</a>
            </div>
        );
    }
});
