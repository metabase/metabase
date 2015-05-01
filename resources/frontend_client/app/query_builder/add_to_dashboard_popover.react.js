'use strict';
/*global cx, OnClickOutside, SelectionModule*/

var AddToDashboardPopover = React.createClass({
    displayName: 'AddToDashboardPopover',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        dashboardApi: React.PropTypes.func.isRequired
    },
    getInitialState: function () {
        this.loadDashboardList();
        return {
            dashboards: null,
            isCreating: false,
            errors: null
        };
    },
    loadDashboardList: function() {
        var component = this;
        this.props.dashboardApi.list({
            'orgId': this.props.card.organization.id,
            'filterMode': 'all'
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
                console.log('booyah');
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
            'organization': this.props.card.organization.id,
            'name': (name && name.length > 0) ? name : null,
            'description': (description && description.length > 0) ? name : null,
            'public_perms': 0
        };

        // create a new dashboard, then add the card to that
        var component = this;
        this.props.dashboardApi.create(newDash, function(result) {
            component.addToExistingDash(result, true);
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
                            <CheckIcon width="12px" height="12px" />
                    	   <span className="SelectionModule-display">{dash.name}</span>
                        </li>
                    )
                )
            }
        }

        return (
            <div>
                <h3>Dashboards</h3>
                <ul className="text-brand">
                    {dashboardsList}
                </ul>
                <div className="p2 border-top">
                    <button onClick={this.toggleCreate}>Create a new dashboard</button>
                </div>
            </div>
        );
    },
    renderCreateDashboardForm: function() {
        // TODO: hard coding values :(
        var privacyOptions = [
            (<option key="0" value="0">Private</option>),
            (<option key="1" value="1">Others can read</option>),
            (<option key="2" value="2">Others can modify</option>)
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

        var buttonClasses = cx({
            "Button": true,
            "Button--primary": true
        });

        return (
            <form className="Form-new" onSubmit={this.createNewDash}>
                <div className="Form-offset">
                    <h3>Create a new dashboard</h3>
                    <a onClick={this.toggleCreate}>X</a>
                </div>

                <FormField
                    displayName="Name"
                    fieldName="name"
                    showCharm={true}
                    errors={this.state.errors}>
                    <input ref="name" className="Form-input Form-offset full" name="name" placeholder="What is the name of your dashboard?" autofocus/>
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
                    <button className={buttonClasses}>
                        Save
                    </button>
                    {formError}
                </div>
            </form>
        );
    },
    render: function() {
        if (this.state.isCreating) {
            return this.renderCreateDashboardForm();
        } else if (this.state.newDashSuccess) {
            var dashDetails = this.state.newDashSuccess;
            var dashLink = "/"+this.props.card.organization.slug+"/dash/"+dashDetails.id;

            return (
                <div>
                    <p>Your dashboard, {dashDetails.name} was created and {this.props.card.name} was added.</p>
                    <p><a href={dashLink}>Let me check it out.</a></p>
                </div>
            );

        } else if (this.state.existingDashSuccess) {
            var dashDetails = this.state.existingDashSuccess;
            var dashLink = "/"+this.props.card.organization.slug+"/dash/"+dashDetails.id;

            return (
                <div className="Success flex flex-column">
                    <CheckIcon width="64px" height="64px" />
                    <p>{this.props.card.name} was added to {dashDetails.name}</p>
                    <p><a href={dashLink}>Let me check it out.</a></p>
                </div>
            );

        } else {
            return this.renderDashboardsList();
        }
    }
});
