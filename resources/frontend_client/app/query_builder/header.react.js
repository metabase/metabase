'use strict';
/*global setTimeout, clearTimeout*/

import ActionButton from './action_button.react';
import AddToDashboard from './add_to_dashboard.react';
import Icon from './icon.react';
import Popover from './popover.react';
import QueryModeToggle from './query_mode_toggle.react';
import Saver from './saver.react';

var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
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
        };
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
    permissions: function() {
        var text;
        switch(this.props.card.public_perms) {
            case 0:
                text = 'Private';
                break;
            case 1:
                text = 'Others can read';
                break;
            case 2:
                text = 'Others can modify';
                break;
            default:
                return 'Error';
        }
        return (
            <span className="Badge Badge--permissions ml2">
                {text}
            </span>
        );
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
                    className='inline-block ml1 link'
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
                    className='Button Button--primary'
                />
            );
        }

        // NOTE: we expect our component provider set this to something falsey if download not available
        var downloadButton;
        if (this.props.downloadLink) {
            downloadButton = (
                <a className="mx1" href={this.props.downloadLink} title="Download this data" target="_blank">
                    <Icon name='download'>
                        <Popover>
                            <span>Download data</span>
                        </Popover>
                    </Icon>
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
            <div className="QueryHeader QueryBuilder-section wrapper flex align-center">
                <div className="QueryHeader-details">
                    <h1 className="QueryName">{title}</h1>
                    {this.permissions()}
                    {editButton}
                </div>

                <div className="QueryHeader-actions">
                    <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                        {saveButton}
                    </ReactCSSTransitionGroup>
                    <ReactCSSTransitionGroup transitionName="Transition-qb-section">
                        {downloadButton}
                    </ReactCSSTransitionGroup>
                    <AddToDashboard
                        card={this.props.card}
                        dashboardApi={this.props.dashboardApi}
                    />
                    <ReactCSSTransitionGroup transitionName="Transition-qb-querybutton">
                        {queryModeToggle}
                    </ReactCSSTransitionGroup>
                </div>
            </div>
        );
    }
});
