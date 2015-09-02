"use strict";

import React, { Component, PropTypes } from "react";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.react";
import { fetchCards } from "../actions";


export default class Cards extends Component {

    constructor() {
        super();
        this.state = { error: null };
    }

    async componentDidMount() {
        try {
            await this.props.dispatch(fetchCards('all'));
        } catch (error) {
            this.setState({ error });
        }
    }

    renderCards(cards) {

        // colors for each user
        // do we show user initials or the MB user icon

        return (
            <div>
            {cards.map(card =>
                <div key={card.id} className="Card">
                    {card.name}, {card.display}
                </div>
            )}
            </div>
        );
    }

    render() {
        let { cards } = this.props;
        let { error } = this.state;

        return (
            <LoadingAndErrorWrapper className="" loading={!cards} error={error}>
            {() =>
                <div className="full flex flex-column">
                    <div className="">
                        { cards.length === 0 ?
                            <div className="flex flex-column layout-centered">
                                <span className="QuestionCircle">?</span>
                                <div className="text-normal mt3 mb1">Hmmm, looks like nothing has happened yet.</div>
                                <div className="text-normal text-grey-2">Save a question and get this baby going!</div>
                            </div>
                        :
                            this.renderCards(cards)
                        }
                    </div>
                </div>
            }
            </LoadingAndErrorWrapper>
        );
    }
}
