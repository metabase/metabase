'use strict';
/*global setTimeout, clearTimeout*/

import ActionButton from 'metabase/components/ActionButton.react';
import AddToDashboard from './add_to_dashboard.react';
import AddToDashSelectDashModal from '../components/AddToDashSelectDashModal.react';
import CardFavoriteButton from './card_favorite_button.react';
import DeleteQuestionModal from '../components/DeleteQuestionModal.react';
import Header from "metabase/components/Header.react";
import Icon from "metabase/components/Icon.react";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger.react";
import QueryModeToggle from './query_mode_toggle.react';
import QuestionSavedModal from '../components/QuestionSavedModal.react';
import SaveQuestionModal from '../components/SaveQuestionModal.react';

import inflection from "inflection";
import cx from "classnames";

export default React.createClass({
    displayName: 'QueryHeader',
    propTypes: {
        card: React.PropTypes.object.isRequired,
        tableMetadata: React.PropTypes.object, // can't be required, sometimes null
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        notifyCardChangedFn: React.PropTypes.func.isRequired,
        notifyCardDeletedFn: React.PropTypes.func.isRequired,
        notifyCardAddedToDashFn: React.PropTypes.func.isRequired,
        revertCardFn: React.PropTypes.func.isRequired,
        setQueryModeFn: React.PropTypes.func.isRequired,
        isShowingDataReference: React.PropTypes.bool.isRequired,
        toggleDataReferenceFn: React.PropTypes.func.isRequired,
        cardIsNewFn: React.PropTypes.func.isRequired,
        cardIsDirtyFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        return {
            recentlySaved: null,
            modal: null
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
                if (this.props.fromUrl) {
                    this.goBack();
                    return;
                }

                if (this.isMounted()) {
                    this.props.notifyCardCreatedFn(newCard);

                    // update local state to reflect new card state
                    this.setState({ recentlySaved: "created", modal: "saved" }, this.resetStateOnTimeout);
                }
            });
        } else {
            // updating an existing card
            return this.props.cardApi.update(card).$promise.then((updatedCard) => {
                if (this.props.fromUrl) {
                    this.goBack();
                    return;
                }

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

    setCardAttribute: function(attribute, value) {
        this.props.card[attribute] = value;
        this.props.notifyCardChangedFn(this.props.card);
    },

    goBack: function() {
        this.props.onChangeLocation(this.props.fromUrl);
    },

    getHeaderButtons: function() {
        var saveButton;
        if (this.props.cardIsNewFn() && this.props.cardIsDirtyFn()) {
            saveButton = (
                <PopoverWithTrigger
                    ref="saveModal"
                    tether={false}
                    triggerClasses="h4 px1 text-grey-4 text-brand-hover text-uppercase"
                    triggerElement="Save"
                >
                    <SaveQuestionModal
                        card={this.props.card}
                        tableMetadata={this.props.tableMetadata}
                        saveFn={this.saveCard}
                        closeFn={() => this.refs.saveModal.toggleModal()}
                    />
                </PopoverWithTrigger>
            );
        }

        var cloneButton;
        if (this.props.card.id) {
            cloneButton = (
                <a href="#" className="mx1 text-grey-4 text-brand-hover" title="Ask another question based on this question">
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
            <a href="#" className={dataReferenceButtonClasses} title="Get help on what data means">
                <Icon name='reference' width="16px" height="16px" onClick={this.toggleDataReference}></Icon>
            </a>
        );

        return [
            [saveButton, queryModeToggle],
            [cardFavorite, cloneButton, addToDashButton],
            [dataReferenceButton]
        ].map(section => section.filter(button => !!button)).filter(section => section.length > 0);
    },

    getEditingButtons: function() {
        var editingButtons = [];

        if (this.state.recentlySaved === "updated" || (this.props.cardIsDirtyFn() && this.props.card.is_creator)) {
            editingButtons.push(
                <ActionButton
                    actionFn={this.save}
                    className='Button Button--small Button--primary text-uppercase'
                    normalText="Update"
                    activeText="Updating…"
                    failedText="Update failed"
                    successText="Updated"
                />
            );
        } else if (this.props.fromUrl) {
            editingButtons.push(
                <a className="Button Button--small Button--primary text-uppercase" href="#" onClick={this.goBack}>Back</a>
            );
        }
        if (this.props.cardIsDirtyFn()) {
            editingButtons.push(
                <a className="Button Button--small text-uppercase" href="#" onClick={this.props.revertCardFn}>Discard Changes</a>
            );
        }
        editingButtons.push(
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
        );
        return editingButtons;
    },

    getModal: function() {
        if (this.state.modal === "saved") {
            return (
                <QuestionSavedModal
                    addToDashboardFn={() => this.setState({ modal: "add-to-dashboard" })}
                    closeFn={() => this.setState({ modal: null })}
                />
            );
        } else if (this.state.modal === "add-to-dashboard") {
            return (
                <AddToDashSelectDashModal
                    card={this.props.card}
                    dashboardApi={this.props.dashboardApi}
                    closeFn={() => this.setState({ modal: null })}
                    notifyCardAddedToDashFn={this.props.notifyCardAddedToDashFn}
                />
            );
        } else {
            return null;
        }
    },

    render: function() {
        var subtitleText;
        if (this.props.card) {
            if (this.props.card.dashboard_count > 0) {
                subtitleText = "Changes will be reflected in " + this.props.card.dashboard_count + " " + inflection.inflect("dashboard", this.props.card.dashboard_count) + " and can be reverted.";
            } else {
                subtitleText = "Changes can be reverted."
            }
        }

        return (
            <Header
                objectType="question"
                item={this.props.card}
                isEditing={!this.props.cardIsNewFn() && this.props.card.is_creator}
                isEditingInfo={!this.props.cardIsNewFn() && this.props.card.is_creator}
                headerButtons={this.getHeaderButtons()}
                editingTitle="You are editing a saved question"
                editingSubtitle={subtitleText}
                editingButtons={this.getEditingButtons()}
                setItemAttributeFn={this.setCardAttribute}
            >
                {this.props.fromUrl}
                {this.getModal()}
            </Header>
        );
    }
});
