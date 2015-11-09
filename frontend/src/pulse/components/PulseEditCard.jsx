import React, { Component, PropTypes } from "react";

import PulseCardPreview from "./PulseCardPreview.jsx";

import Select from "metabase/components/Select.jsx";

export default class PulseEditCard extends Component {
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
    }

    removeCard(index) {
        let { pulse } = this.props;
        this.props.setPulse({
            ...pulse,
            cards: [...pulse.cards.slice(0, index), ...pulse.cards.slice(index + 1)]
        });
    }

    render() {
        let { pulse, cards, cardList } = this.props;

        let pulseCards = pulse ? pulse.cards.slice() : [];
        if (pulseCards.length < 5) {
            pulseCards.push(null);
        }

        return (
            <div className="py1">
                <h2>Pick your data</h2>
                <p>Pick up to five questions you'd like to send in this pulse</p>
                <ol className="my3">
                    {cards && pulseCards.map((card, index) =>
                        <li key={index} className="my1 flex align-top" style={{ width: "400px" }}>
                            <span className="h3 text-bold mr1 mt1">{index + 1}.</span>
                            { card ?
                                <PulseCardPreview card={card} onRemove={this.removeCard.bind(this, index)} />
                            :
                                <Select
                                    className="flex-full"
                                    placeholder="Pick a question to include in this pulse"
                                    value={card && cards[card.id]}
                                    options={cardList}
                                    optionNameFn={o => o.name}
                                    optionValueFn={o => o.id}
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
