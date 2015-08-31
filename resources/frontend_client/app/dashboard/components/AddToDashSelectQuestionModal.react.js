'use strict';

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import ModalContent from "metabase/components/ModalContent.react";
import SortableItemList from "metabase/components/SortableItemList.react";

import { fetchCards, setEditingDashboard, addCardToDashboard } from "../actions";

import moment from 'moment';

export default class AddToDashSelectQuestionModal extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchCards());
        } catch (error) {
            this.setState({ error });
        }
    }

    onAdd(card) {
        this.props.dispatch(addCardToDashboard({ dashId: this.props.dashboard.id, cardId: card.id }));
        this.props.dispatch(setEditingDashboard(true));
        this.props.onClose();
    }

    render() {
        var { error } = this.state;
        if (this.props.cards && this.props.cards.length === 0) {
            error = { message: "No cards have been saved." };
        }
        return (
            <ModalContent
                title="Add Question to Dashboard"
                closeFn={this.props.onClose}
            >
                <LoadingAndErrorWrapper loading={!this.props.cards} error={error} >
                {() =>
                    <SortableItemList
                        items={this.props.cards}
                        onClickItemFn={(card) => this.onAdd(card)}
                        showIcons={true}
                    />
                }
                </LoadingAndErrorWrapper>
            </ModalContent>
        );
    }
}

AddToDashSelectQuestionModal.propTypes = {
    dispatch: React.PropTypes.func.isRequired,
    dashboard: React.PropTypes.object.isRequired,
    cards: React.PropTypes.array,
    onClose: React.PropTypes.func.isRequired
};
