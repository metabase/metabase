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
        notifyCardChangedFn: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
        downloadLink: React.PropTypes.string
    },

    getInitialState: function() {
        return {
            origCard: JSON.stringify(this.props.card),
            recentlySaved: false,
            resetOrigCard: false
        }
    },

    componentWillReceiveProps: function(nextProps) {
        // pre-empt a card update via props
        // we need this here for a specific case where we know the card will be changing
        // and thus we need to reset our :origCard state BEFORE our next render cycle
        if (this.state.resetOrigCard) {
            this.setState({
                origCard: JSON.stringify(nextProps.card),
                recentlySaved: false,
                resetOrigCard: false
            });
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
        }.bind(component), 5000);
    },

    save: function() {
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

    setQueryMode: function(mode) {
        // we need to update our dirty state here
        var component = this;
        this.setState({
            resetOrigCard: true
        }, function() {
            component.props.setQueryModeFn(mode);
        });
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
                    saveFn={this.saveCard}
                    buttonText="Save"
                    saveButtonText="Create card"
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
                <a className="mx1" href={this.props.downloadLink} title="Download this data" target="_blank">
                    <DownloadIcon>
                        <Popover>
                            <span>Download data</span>
                        </Popover>
                    </DownloadIcon>
                </a>
            );
        }

        var queryModeToggle;
        if (this.cardIsNew() && !this.cardIsDirty()) {
            queryModeToggle = (
                <QueryModeToggle
                    currentQueryMode={this.props.card.dataset_query.type}
                    setQueryModeFn={this.setQueryMode}
                />
            );
        }

        return (
            <div className="QueryHeader QueryBuilder-section flex align-center">
                <div className="QueryHeader-details">
                    <h1 className="QueryName">{title}</h1>
                    {editButton}
                    {saveButton}
                </div>
    
                <div className="QueryHeader-actions">
                    {downloadButton}
                    <AddToDashboard
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                    />
                    {queryModeToggle}
                </div>
            </div>
        );
    }
});
