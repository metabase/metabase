import React, { Component, PropTypes } from "react";

import CardPicker from "./CardPicker.jsx";
import PulseCardPreview from "./PulseCardPreview.jsx";

import MetabaseAnalytics from "metabase/lib/analytics";


export default class PulseEditCards extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    setCard(index, cardId) {
        let { pulse } = this.props;
        this.props.setPulse({
            ...pulse,
            cards: [...pulse.cards.slice(0, index), { id: cardId }, ...pulse.cards.slice(index + 1)]
        });

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "AddCard", index);
    }

    removeCard(index) {
        let { pulse } = this.props;
        this.props.setPulse({
            ...pulse,
            cards: [...pulse.cards.slice(0, index), ...pulse.cards.slice(index + 1)]
        });

        MetabaseAnalytics.trackEvent((this.props.pulseId) ? "PulseEdit" : "PulseCreate", "RemoveCard", index);
    }

    render() {
        let { pulse, cards, cardList, cardPreviews } = this.props;

        let pulseCards = pulse ? pulse.cards.slice() : [];
        if (pulseCards.length < 5) {
            pulseCards.push(null);
        }

        return (
            <div className="py1">
                <h2>Pick your data</h2>
                <p className="mt1 h4 text-bold text-grey-3">Pick up to five questions you'd like to send in this pulse</p>
                <ol className="my3">
                    {cards && pulseCards.map((card, index) =>
                        <li key={index} className="my1 flex align-top" style={{ width: "400px" }}>
                            <span className="h3 text-bold mr1 mt2">{index + 1}.</span>
                            { card ?
                                <PulseCardPreview
                                    card={card}
                                    cardPreviews={cardPreviews}
                                    onRemove={this.removeCard.bind(this, index)}
                                    dispatch={this.props.dispatch}
                                />
                            :
                                <CardPicker
                                    cardList={cardList}
                                    onChange={this.setCard.bind(this, index)}
                                />
                            }
                        </li>
                    )}
                </ol>
            </div>
        );
    }
}
