'use strict';
/*global setTimeout, clearTimeout*/

import ActionButton from './action_button.react';
import AddToDashboard from './add_to_dashboard.react';
import CardFavoriteButton from './card_favorite_button.react';
import Icon from './icon.react';
import Popover from './popover.react';
import QueryModeToggle from './query_mode_toggle.react';
import Saver from './saver.react';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        notifyCardChangedFn: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
        downloadLink: React.PropTypes.string,
        isShowingDataReference: React.PropTypes.bool.isRequired,
        toggleDataReferenceFn: React.PropTypes.func.isRequired,
        cardIsNewFn: React.PropTypes.func.isRequired,
        cardIsDirtyFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            recentlySaved: null
        };
    },

    resetStateOnTimeout: function() {
        // clear any previously set timeouts then start a new one
        clearTimeout(this.timeout);
        this.timeout = setTimeout(() => {
            if (this.isMounted()) {
                this.setState({
                    recentlySaved: null
                });
            }
        }, 5000);
    },

    save: function() {
        return this.saveCard(this.props.card);
    },

    saveCard: function(card) {
        if (card.id === undefined) {
            // creating a new card
            return this.props.cardApi.create(card).$promise.then((newCard) => {
                if (this.isMounted()) {
                    this.props.notifyCardCreatedFn(newCard);

                    // update local state to reflect new card state
                    this.setState({ recentlySaved: "created" }, this.resetStateOnTimeout);
                }
            });
        } else {
            // updating an existing card
            return this.props.cardApi.update(card).$promise.then((updatedCard) => {
                if (this.isMounted()) {
                    this.props.notifyCardUpdatedFn(updatedCard);

                    // update local state to reflect new card state
                    this.setState({ recentlySaved: "updated" }, this.resetStateOnTimeout);
                }
            });
        }
    },

    deleteCard: function () {
        var card = this.props.card;
        return this.props.cardApi.delete({ 'cardId': card.id }).$promise.then(() => {
            this.props.notifyCardDeletedFn();
        });
    },

    setQueryMode: function(mode) {
        this.props.setQueryModeFn(mode);
    },

    toggleDataReference: function() {
        this.props.toggleDataReferenceFn();
    },

    permissions: function() {
        var permission;
        if(this.props.card.public_perms) {
            switch(this.props.card.public_perms) {
                case 0:
                    permission = (
                        <span className="ml1 sm-ml1 text-grey-3">
                            <Icon name="lock" width="12px" height="12px" />
                        </span>
                    )
                    break;
                default:
                    return '';
            }
            return permission;
        }
    },

    render: function() {
        var title = this.props.card.name || "New question";

        var editButton;
        if (!this.props.cardIsNewFn() && this.props.card.is_creator) {
            editButton = (
                <Saver
                    card={this.props.card}
                    saveFn={this.props.notifyCardChangedFn}
                    saveButtonText="Done"
                    className='inline-block ml1 link'
                    canDelete={this.props.card.is_creator}
                    deleteFn={this.deleteCard}
                />
            );
        }

        var saveButton;
        if (this.props.cardIsNewFn() && this.props.cardIsDirtyFn()) {
            // new cards get a custom treatment, like saving a new Excel document
            saveButton = (
                <Saver
                    card={this.props.card}
                    saveFn={this.saveCard}
                    buttonText="Save"
                    saveButtonText="Create card"
                    canDelete={false}
                />
            );
        } else if (this.state.recentlySaved === "updated" || (this.props.cardIsDirtyFn() && this.props.card.is_creator)) {
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
                    <Icon name='download' width="16px" height="16px">
                        <Popover>
                            <span>Download data</span>
                        </Popover>
                    </Icon>
                </a>
            );
        }

        var cloneButton;
        if (this.props.card.id) {
            cloneButton = (
                <a href="#" className="mx1 text-grey-4 text-brand-hover">
                    <Icon name='clone' width="16px" height="16px" onClick={this.props.cloneCardFn}></Icon>
                </a>
            );
        }

        var queryModeToggle;
        if (this.props.cardIsNewFn() && !this.props.cardIsDirtyFn()) {
            queryModeToggle = (
                <QueryModeToggle
                    currentQueryMode={this.props.card.dataset_query.type}
                    setQueryModeFn={this.setQueryMode}
                />
            );
        }

        var cardFavorite;
        if (this.props.card.id != undefined) {
            cardFavorite = (<CardFavoriteButton cardApi={this.props.cardApi} cardId={this.props.card.id}></CardFavoriteButton>);
        }

        var addToDashButton;
        if (this.props.card.id != undefined) {
            addToDashButton = (
                <AddToDashboard
                    card={this.props.card}
                    dashboardApi={this.props.dashboardApi}
                    broadcastEventFn={this.props.broadcastEventFn}
                />
            )
        }

        var dataReferenceButtonClasses = cx({
            'mx1': true,
            'transition-color': true,
            'text-grey-4': !this.props.isShowingDataReference,
            'text-brand': this.props.isShowingDataReference,
            'text-brand-hover': !this.state.isShowingDataReference
        });
        var dataReferenceButton = (
            <a href="#" className={dataReferenceButtonClasses}>
                <Icon name='reference' width="16px" height="16px" onClick={this.toggleDataReference}></Icon>
            </a>
        );

        var attribution;

        if(this.props.card.creator) {
            attribution = (
                <div className="Entity-attribution">
                    Asked by {this.props.card.creator.common_name}
                </div>
            );
        }

        var hasLeft = !!downloadButton;
        var hasMiddle = !!(cardFavorite || cloneButton || addToDashButton);
        var hasRight = !!dataReferenceButton;

        var dividerLeft;
        if (hasLeft && (hasMiddle || hasRight)) {
            dividerLeft = <div className="border-right border-dark mx1">&nbsp;</div>
        }

        var dividerRight;
        if (hasRight && hasMiddle) {
            dividerRight = <div className="border-right border-dark mx1">&nbsp;</div>
        }

        return (
            <div className="py1 lg-py2 xl-py3 QueryBuilder-section wrapper flex align-center">
                <div className="Entity">
                    <div className="flex align-center">
                        <h1 className="Entity-title">{title}</h1>
                        {this.permissions()}
                        {editButton}
                    </div>
                    {attribution}
                </div>

                <div className="QueryHeader-actions flex-align-right">

                    <span className="pr3">
                        {saveButton}
                        {queryModeToggle}
                    </span>

                    {downloadButton}

                    {dividerLeft}

                    {cardFavorite}
                    {cloneButton}
                    {addToDashButton}

                    {dividerRight}

                    {dataReferenceButton}
                </div>
            </div>
        );
    }
});
