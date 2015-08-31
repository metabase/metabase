'use strict';

import FormField from "metabase/components/FormField.react";
import Icon from "metabase/components/Icon.react";
import ModalContent from "metabase/components/ModalContent.react";

var cx = React.addons.classSet;

export default React.createClass({
    displayName: "CreateDashboardModal",
    propTypes: {
        createDashboardFn: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func
    },

    getInitialState: function () {
        return {
            name: null,
            description: null,
            errors: null
        };
    },

    setName: function(event) {
        this.setState({ name: event.target.value });
    },

    setDescription: function(event) {
        this.setState({ description: event.target.value });
    },

    createNewDash: function(event) {
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
    },

    render: function() {
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
                            full" name="name" placeholder="What is the name of your dashboard?" value={this.state.name} onChange={this.setName} autofocus />
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
                        <span className="px1">or</span><a href="#" className="no-decoration text-brand text-bold" onClick={this.props.closeFn}>Cancel</a>
                        {formError}
                    </div>
                </form>
            </ModalContent>
        );
    }
});
