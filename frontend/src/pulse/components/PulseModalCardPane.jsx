import React, { Component, PropTypes } from "react";

import Select from "metabase/components/Select.jsx";

export default class PulseModalCardPane extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    setCard(index, card) {
        let { pulse } = this.props;
        let cards = [...pulse.cards];
        cards[index] = card;
        this.props.setPulse({ ...pulse, cards: cards })
    }

    render() {
        let { pulse } = this.props;
        return (
            <div className="py4 flex flex-column align-center">
                <h3>What should we send?</h3>
                <ol className="my3">
                    {[1,2,3,4,5].map((n, i) =>
                        <li className="my1 flex align-center">
                            <span className="h3 text-bold mr1">{n}.</span>
                            <Select
                                value={pulse.cards[i]}
                                options={["", "a", "b", "c"]}
                                optionNameFn={o => o}
                                optionValueFn={o => o}
                                onChange={this.setCard.bind(this, i)}
                            />
                        </li>
                    )}
                </ol>
            </div>
        );
    }
}
