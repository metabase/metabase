'use strict';

import OnClickOutside from 'react-onclickoutside';

import FormField from './form_field.react';
import Icon from './icon.react';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'AddToDashboardPopover',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired
    },
    mixins: [OnClickOutside],

    getInitialState: function () {
        this.loadDashboardList();
        return {
            dashboards: null,
            isCreating: false,
            errors: null
        };
    },

    handleClickOutside: function() {
        this.props.closePopoverFn();
    },

    loadDashboardList: function() {
        var component = this;
        this.props.dashboardApi.list({
            'filterMode': 'mine'
        }, function(result) {
            component.setState({
                dashboards: result
            });
        }, function(error) {
            // TODO: do something relevant here
        });
    },

    toggleCreate: function() {
        var state = this.getInitialState();
        state.dashboards = this.state.dashboards;
        state.isCreating = !this.state.isCreating;
        this.replaceState(state);
    },

    setName: function(event) {
        // this is a bit stupid, but we put this here purely so that as someone types in the dashboard name we can know it's changed
        // and update our form isDirty state.  so this call is purely so that we re-render after someone changes the dash name
        this.setState({});
    },

    addToExistingDash: function(dashboard, newDash) {
        var isNewDash = (newDash !== undefined) ? newDash : false;

        var component = this;
        this.props.dashboardApi.addcard({
            'dashId': dashboard.id,
            'cardId': this.props.card.id
        }, function(result) {
            if (isNewDash) {
                component.setState({
                    isCreating: false,
                    errors: null,
                    newDashSuccess: dashboard
                });
            } else {
                component.setState({
                    isCreating: false,
                    errors: null,
                    existingDashSuccess: dashboard
                });
            }
        }, function(error) {
            component.setState({
                errors: error
            });
        });
    },

    createNewDash: function(event) {
        event.preventDefault();

        var name = this.refs.name.getDOMNode().value.trim();
        var description = this.refs.description.getDOMNode().value.trim();
        var perms = this.refs.public_perms.getDOMNode().value;

        // populate a new Dash object
        var newDash = {
            'name': (name && name.length > 0) ? name : null,
            'description': (description && description.length > 0) ? name : null,
            'public_perms': 0
        };

        // create a new dashboard, then add the card to that
        var component = this;
        this.props.dashboardApi.create(newDash, function(result) {
            component.addToExistingDash(result, true);

            // send out a notice that we created a new dashboard
            component.props.broadcastEventFn("dashboard:create", result.id);
        }, function(error) {
            component.setState({
                errors: error
            });
        });
    },

    renderDashboardsList: function() {
        var dashboardsList = [];
        if (this.state.dashboards) {
            for (var i=0; i < this.state.dashboards.length; i++) {
                var dash = this.state.dashboards[i];
                dashboardsList.push(
                    (
                        <li className="SelectionItem" onClick={this.addToExistingDash.bind(null, dash, false)}>
                            <Icon name='check' width="12px" height="12px" />
                    	    <span className="SelectionModule-display">{dash.name}</span>
                        </li>
                    )
                );
            }
        }

        return (
            <div>
                <h3 className="p2 m0">Add <span className="text-brand">{this.props.card.name}</span> to a dashboard</h3>
                <ul className="text-brand">
                    {dashboardsList}
                </ul>
                <div className="p2 text-centered border-top">
                    <a className="link" onClick={this.toggleCreate}>Create a new dashboard</a>
                </div>
            </div>
        );
    },

    renderCreateDashboardForm: function() {
        // TODO: hard coding values :(
        var privacyOptions = [
            (<option key="0" value={0}>Private</option>),
            (<option key="1" value={1}>Public (Others can read)</option>)
        ];

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

        var name = null;
        if (this.refs.name) {
            name = this.refs.name.getDOMNode().value.trim();
        }

        var formReady = (name !== null && name !== "");

        var buttonClasses = cx({
            "Button": true,
            "Button--primary": formReady
        });

        var saveButton;
        if (formReady) {
            saveButton = (
                <button className={buttonClasses}>
                    Save
                </button>
            );
        } else {
            saveButton = (
                <button className={buttonClasses} disabled>
                    Save
                </button>
            );
        }

        return (
            <form className="Form-new" onSubmit={this.createNewDash}>
                <div className="Form-offset flex align-center mr4">
                    <h3 className="flex-full">Create a new dashboard</h3>
                    <a className="text-grey-3" onClick={this.toggleCreate}>
                        <Icon name='close' width="12px" height="12px"/>
                    </a>
                </div>

                <FormField
                    displayName="Name"
                    fieldName="name"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="name" className="Form-input Form-offset full" name="name" placeholder="What is the name of your dashboard?" onChange={this.setName} autofocus />
                </FormField>

                <FormField
                    displayName="Description (optional)"
                    fieldName="description"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="description" className="Form-input Form-offset full" name="description" placeholder="What else should people know about this?" />
                </FormField>

                <FormField
                    displayName="Visibility"
                    fieldName="public_perms"
                    showCharm={false}
                    errors={this.state.errors}>
                    <label className="Select Form-offset">
                        <select ref="public_perms">
                            {privacyOptions}
                        </select>
                    </label>
                </FormField>

                <div className="Form-actions">
                    {saveButton}
                    {formError}
                </div>
            </form>
        );
    },

    renderSuccess: function(message, link) {
        return (
            <div className="Success py4 flex flex-column align-center text-success">
                <Icon name='check' width="64px" height="64px" />
                <div className="AddToDashSuccess ">{message}</div>
                <a href={link}>Let me check it out.</a>
            </div>
        );
    },

    render: function() {
        var content,
            dashDetails,
            dashLink;

        if (this.state.isCreating) {
            content = this.renderCreateDashboardForm();
        } else if (this.state.newDashSuccess) {
            dashDetails = this.state.newDashSuccess;
            dashLink = "/dash/"+dashDetails.id;

            content = this.renderSuccess("Your dashboard, " + dashDetails.name + " was created and " + this.props.card.name + " was added.", dashLink);

        } else if (this.state.existingDashSuccess) {
            dashDetails = this.state.existingDashSuccess;
            dashLink = "/dash/"+dashDetails.id;

            content = this.renderSuccess(this.props.card.name + " was added to " + dashDetails.name, dashLink);
        } else {
            content = this.renderDashboardsList();
        }

        return (
            <div>
                {content}
            </div>
        );
    }
});
