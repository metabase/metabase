'use strict';

import OnClickOutside from 'react-onclickoutside';

import FormField from './form_field.react';
import Icon from './icon.react';

var cx = React.addons.classSet;

export default React.createClass({
    displayName: 'Saver',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        saveFn: React.PropTypes.func.isRequired,
        deleteFn: React.PropTypes.func
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

        this.props.saveFn(card).then((success) => {
            if (this.isMounted()) {
                this.setState({
                    modalOpen: false
                });
            }
        }, (error) => {
            if (this.isMounted()) {
                this.setState({
                    errors: error
                });
            }
        });
    },

    renderCardDelete: function () {
        if(this.props.canDelete) {
           return (
                <div className="Form-field">
                    <label className="Form-label mb1">
                        <span>Danger zone</span>:
                    </label>
                    <label>
                        <a className="Button Button--danger" onClick={this.props.deleteFn}>Delete card</a>
                    </label>
                </div>
           )
        }
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
            <form className="NewForm full" onSubmit={this.save}>
                <div className="Form-header flex align-center">
                    <h2 className="flex-full">Save Question</h2>
                    <a className="text-grey-3" onClick={this.toggleModal}>
                        <Icon name='close' width="16px" height="16px"/>
                    </a>
                </div>

                <div className="Form-inputs">
                    <FormField
                        displayName="Name"
                        fieldName="name"
                        errors={this.state.errors}>
                        <input ref="name" className="Form-input full" name="name" placeholder="What is the name of your card?" defaultValue={this.props.card.name} autofocus/>
                    </FormField>

                    <FormField
                        displayName="Description (optional)"
                        fieldName="description"
                        errors={this.state.errors}>
                        <input ref="description" className="Form-input full" name="description" placeholder="What else should people know about this?" defaultValue={this.props.card.description} />
                    </FormField>

                    <FormField
                        displayName="Privacy"
                        fieldName="public_perms"
                        errors={this.state.errors}>
                        <label className="Select">
                            <select className="mt1" ref="public_perms" defaultValue={this.props.card.public_perms}>
                                {privacyOptions}
                            </select>
                        </label>
                    </FormField>

                    {this.renderCardDelete()}
                </div>

                <div className="Form-actions">
                    <button className={buttonClasses}>
                        {this.props.saveButtonText}
                    </button>
                    <span className="px1">or</span><a href="#" className="no-decoration text-brand text-bold" onClick={this.toggleModal}>Cancel</a>
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
