import React, { Component, PropTypes } from "react";

import FormField from "metabase/components/FormField.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";

import cx from "classnames";

export default class CreateDashboardModal extends Component {
    constructor(props, context) {
        super(props, context);
        this.createNewDash = this.createNewDash.bind(this);
        this.setDescription = this.setDescription.bind(this);
        this.setName = this.setName.bind(this);

        this.state = {
            name: null,
            description: null,
            errors: null
        };
    }

    static propTypes = {
        createDashboardFn: PropTypes.func.isRequired,
        closeFn: PropTypes.func
    };

    setName(event) {
        this.setState({ name: event.target.value });
    }

    setDescription(event) {
        this.setState({ description: event.target.value });
    }

    createNewDash(event) {
        event.preventDefault();

        var name = this.state.name && this.state.name.trim();
        var description = this.state.description && this.state.description.trim();

        // populate a new Dash object
        var newDash = {
            name: (name && name.length > 0) ? name : null,
            description: (description && description.length > 0) ? description : null,
            public_perms: 2 // public read/write
        };

        // create a new dashboard
        var component = this;
        this.props.createDashboardFn(newDash).then(null, function(error) {
            component.setState({
                errors: error
            });
        });
    }

    render() {
        var formError;
        if (this.state.errors) {
            var errorMessage = "Server error encountered";
            if (this.state.errors.data &&
                this.state.errors.data.message) {
                errorMessage = this.state.errors.data.message;
            }

            // TODO: timeout display?
            formError = (
                <span className="text-error px2">{errorMessage}</span>
            );
        }

        var name = this.state.name && this.state.name.trim();

        var formReady = (name !== null && name !== "");

        var buttonClasses = cx({
            "Button": true,
            "Button--primary": formReady
        });

        var createButton = (
            <button className={buttonClasses} disabled={!formReady}>
                Create
            </button>
        );

        return (
            <ModalContent
                title="Create Dashboard"
                closeFn={this.props.closeFn}
            >
                <form className="Modal-form" onSubmit={this.createNewDash}>
                    <div className="Form-inputs">
                        <FormField
                            displayName="Name"
                            fieldName="name"
                            errors={this.state.errors}>
                            <input className="Form-input
                            full" name="name" placeholder="What is the name of your dashboard?" value={this.state.name} onChange={this.setName} autoFocus />
                        </FormField>

                        <FormField
                            displayName="Description"
                            fieldName="description"
                            errors={this.state.errors}>
                            <input className="Form-input full" name="description" placeholder="It's optional but oh, so helpful"  value={this.state.description} onChange={this.setDescription} />
                        </FormField>
                    </div>

                    <div className="Form-actions">
                        {createButton}
                        <span className="px1">or</span><a className="no-decoration text-brand text-bold" onClick={this.props.closeFn}>Cancel</a>
                        {formError}
                    </div>
                </form>
            </ModalContent>
        );
    }
}
