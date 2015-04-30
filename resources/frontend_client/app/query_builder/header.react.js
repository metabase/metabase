'use strict';

// Title - saved card title, otherwise static default
// Edit - only shown after Save
// Save - only shown after Run
// Download Data - only shown after Run
// Add to Dashboard - only shown after Save
// GUI vs SQL mode toggle - 2 mode slider - only visible on initial create (while query empty)

var QueryHeader = React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
        downloadLink: React.PropTypes.string
    },

    getInitialState: function () {
        return {
            origCard: JSON.stringify(this.props.card),
            recentlySaved: false
        }
    },

    cardIsNew: function() {
        // a card is considered new if it has not ID associated with it
        return (this.props.card.id === undefined);
    },

    cardIsDirty: function() {
        // a card is considered dirty if ANY part of it has been changed
        return (JSON.stringify(this.props.card) !== this.state.origCard);
    },

    resetStateOnTimeout: function() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);

        var component = this;
        this.timeout = setTimeout(function() {
            if (component.isMounted()) {
                component.setState({
                    recentlySaved: false
                });
            }
        }.bind(this), 5000);
    },

    save: function() {
        console.log('saving=', this.props.card);
        return this.saveCard(this.props.card);
    },

    saveCard: function(card) {
        var component = this,
            apiCall;
        if (card.id === undefined) {
            // creating a new card
            apiCall = this.props.cardApi.create(card, function (newCard) {
                if (component.isMounted()) {
                    component.props.notifyCardCreatedFn(newCard);

                    // update local state to reflect new card state
                    component.setState({
                        origCard: JSON.stringify(card),
                        recentlySaved: true
                    }, component.resetStateOnTimeout);
                }
            });

        } else {
            // updating an existing card
            apiCall = this.props.cardApi.update(card, function (updatedCard) {
                if (component.isMounted()) {
                    component.props.notifyCardUpdatedFn(updatedCard);

                    // update local state to reflect new card state
                    component.setState({
                        origCard: JSON.stringify(card),
                        recentlySaved: true
                    }, component.resetStateOnTimeout);
                }
            });
        }

        return apiCall.$promise;
    },

    render: function() {
        var title = this.props.card.name || "What would you like to know?";

        var editButton;
        if (!this.cardIsNew()) {
            editButton = (
                <Saver
                    card={this.props.card}
                    saveFn={this.props.notifyCardChangedFn}
                    saveButtonText="Done"
                />
            );
        }

        var saveButton;
        if (this.cardIsNew() && this.cardIsDirty()) {
            // new cards get a custom treatment, like saving a new Excel document
            saveButton = (
                <Saver
                    card={this.props.card}
                    saveFn={this.props.saveCard}
                />
            );
        } else if (this.cardIsDirty() || this.state.recentlySaved) {
            // for existing cards we render a very simply ActionButton
            saveButton = (
                <ActionButton
                    actionFn={this.save}
                />
            );
        }

        // NOTE: we expect our component provider set this to something falsey if download not available
        var downloadButton;
        if (this.props.downloadLink) {
            downloadButton = (
                <a className="inline-block mr1" href={this.props.downloadLink} target="_blank">Download data
                </a>
            );
        }

        return (
            <div className="QueryHeader QueryBuilder-section flex align-center">
                <h1 className="QueryName flex-full">{title}</h1>
                {editButton}
                {saveButton}

                {downloadButton}
                <AddToDashboard
                    card={this.props.card}
                    dashboardApi={this.props.dashboardApi}
                />
                <QueryModeToggle
                    card={this.props.card}
                    setQueryModeFn={this.props.setQueryModeFn}
                />
            </div>
        );
    }
});
