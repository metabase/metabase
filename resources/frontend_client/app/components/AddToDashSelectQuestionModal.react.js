'use strict';

import Modal from 'metabase/components/Modal.react';
import SortableItemList from 'metabase/components/SortableItemList.react';

import moment from 'moment';

export default React.createClass({
    displayName: "AddToDashSelectQuestionModal",
    propTypes: {
        dashboard: React.PropTypes.object.isRequired,
        cardApi: React.PropTypes.func.isRequired,
        dashboardApi: React.PropTypes.func.isRequired,
        closeFn: React.PropTypes.func.isRequired,
        notifyCardAddedToDashFn: React.PropTypes.func.isRequired
    },

    getInitialState: function() {
        this.loadCardList();
        return {
            cards: []
        };
    },

    loadCardList: async function() {
        var cards = await this.props.cardApi.list({
            'filterMode': 'mine'
        }).$promise;
        for (var card of cards) {
            card.updated_at = moment(card.updated_at);
            card.icon = card.display ? 'illustration_visualization_' + card.display : null;
        }
        this.setState({ cards });
    },

    addToDashboard: async function(card) {
        var dashCard = await this.props.dashboardApi.addcard({
            'dashId': this.props.dashboard.id,
            'cardId': card.id
        }).$promise;
        this.props.notifyCardAddedToDashFn(dashCard);
    },

    render: function() {
        return (
            <Modal
                title="Add Question to Dashboard"
                closeFn={this.props.closeFn}
            >
                <SortableItemList
                    items={this.state.cards}
                    onClickItemFn={this.addToDashboard}
                    showIcons={true}
                />
            </Modal>
        );
    }
});
