'use strict';
/*global setTimeout, clearTimeout*/

import ActionButton from './action_button.react';
import AddToDashboard from './add_to_dashboard.react';
import CardFavoriteButton from './card_favorite_button.react';
import Icon from './icon.react';
import QueryModeToggle from './query_mode_toggle.react';
import Saver from './saver.react';
import DeleteQuestionModal from '../components/DeleteQuestionModal.react';
import Input from '../admin/metadata/components/Input.react';
import PopoverWithTrigger from './popover_with_trigger.react';

var cx = React.addons.classSet;
var ReactCSSTransitionGroup = React.addons.CSSTransitionGroup;

export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        tableMetadata: React.PropTypes.object, // can't be required, sometimes null
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        notifyCardChangedFn: React.PropTypes.func.isRequired,
        notifyCardDeletedFn: React.PropTypes.func.isRequired,
        revertCardFn: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
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

    renderEditHeader: function() {
        if (!this.props.cardIsNewFn()) {
            var updateButton, discardButton;
            if (this.props.cardIsDirtyFn()) {
                discardButton = <a className="Button Button--small text-uppercase" href="#" onClick={this.props.revertCardFn}>Discard Changes</a>;
            }
            if (this.state.recentlySaved === "updated" || (this.props.cardIsDirtyFn() && this.props.card.is_creator)) {
                updateButton = (
                    <ActionButton
                        actionFn={this.save}
                        className='Button Button--small Button--primary text-uppercase'
                        normalText="Update"
                        activeText="Updating…"
                        failedText="Update failed"
                        successText="Updated"
                    />
                );
            }
            return (
                <div className="EditHeader p1 px3 flex align-center">
                    <span className="EditHeader-title">You are editing a saved question.</span>
                    <span className="EditHeader-subtitle mx1">Changes will be reflected in 1 dashboard and can be reverted.</span>
                    <span className="flex-align-right">
                        {updateButton}
                        {discardButton}
                        <PopoverWithTrigger
                            ref="deleteModal"
                            tether={false}
                            triggerClasses="Button Button--small text-uppercase"
                            triggerElement="Delete"
                        >
                            <DeleteQuestionModal
                                card={this.props.card}
                                deleteCardFn={this.deleteCard}
                                closeFn={() => this.refs.deleteModal.toggleModal()}
                            />
                        </PopoverWithTrigger>
                    </span>
                </div>
            );
        }
    },

    setCardAttribute: function(attribute, event) {
        this.props.card[attribute] = event.target.value;
        this.props.notifyCardChangedFn(this.props.card);
    },

    render: function() {
        var titleAndDescription;
        if (!this.props.cardIsNewFn() && this.props.card.is_creator) {
            titleAndDescription = (
                <div className="EditTitle flex flex-column flex-full bordered rounded mt1 mb2">
                    <Input className="AdminInput text-bold border-bottom rounded-top h3" type="text" value={this.props.card.name} onChange={this.setCardAttribute.bind(null, "name")}/>
                    <Input className="AdminInput rounded-bottom h4" type="text" value={this.props.card.description} onChange={this.setCardAttribute.bind(null, "description")} placeholder="No description yet" />
                </div>
            );
        } else {
            titleAndDescription = (
                <div className="flex align-center">
                    <h1 className="Entity-title">New question</h1>
                </div>
            );
        }

        var saveButton;
        if (this.props.cardIsNewFn() && this.props.cardIsDirtyFn()) {
            saveButton = (
                <Saver
                    className="h4 px1 text-grey-4 text-brand-hover text-uppercase"
                    card={this.props.card}
                    tableMetadata={this.props.tableMetadata}
                    saveFn={this.saveCard}
                    buttonText="Save"
                    saveButtonText="Save"
                    canDelete={false}
                />
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
        if(this.props.card.creator && false) {
            attribution = (
                <div className="Entity-attribution">
                    Asked by {this.props.card.creator.common_name}
                </div>
            );
        }

        return (
            <div>
                {this.renderEditHeader()}
                <div className="py1 lg-py2 xl-py3 QueryBuilder-section wrapper flex align-center">
                    <div className="Entity">
                        {titleAndDescription}
                        {attribution}
                    </div>

                    <div className="flex align-center flex-align-right">

                        {(saveButton || queryModeToggle) &&
                        <span className="QueryHeader-section">
                            {saveButton}
                            {queryModeToggle}
                        </span>}

                        {(cardFavorite || cloneButton || addToDashButton) &&
                        <span className="QueryHeader-section">
                            {cardFavorite}
                            {cloneButton}
                            {addToDashButton}
                        </span>}

                        <span className="QueryHeader-section">
                            {dataReferenceButton}
                        </span>
                    </div>
                </div>
            </div>
        );
    }
});
