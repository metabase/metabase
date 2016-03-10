import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Popover from "metabase/components/Popover.jsx";

import _ from "underscore";

export default class CardPicker extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            isOpen: false,
            inputValue: "",
            inputWidth: 300
        };

        _.bindAll(this, "onChange", "onInputChange", "onInputFocus", "onInputBlur");
    }

    static propTypes = {
        cardList: PropTypes.array.isRequired,
        onChange: PropTypes.func.isRequired
    };


    onInputChange(e) {
        this.setState({ inputValue: e.target.value });
    }

    onInputFocus() {
        this.setState({ isOpen: true });
    }

    onInputBlur() {
        // Without a timeout here isOpen gets set to false when an item is clicked
        // which causes the click handler to not fire. For some reason this even
        // happens with a 100ms delay, but not 200ms?
        setTimeout(() => this.setState({ isOpen: false }), 250);
    }

    onChange(id) {
        this.props.onChange(id);
        this.setState({ isOpen: false });
    }

    renderItem(card) {
        let error;
        try {
            if (card.dataset_query.query.aggregation[0] === "rows") {
                error = "Raw data cannot be included in pulses";
            }
        } catch (e) {}
        if (card.display === "pin_map" || card.display === "state" || card.display === "country") {
            error = "Maps cannot be included in pulses";
        }

        if (error) {
            return (
                <li className="px2 py1">
                    <h4 className="text-grey-2">{card.name}</h4>
                    <h4 className="text-gold mt1">{error}</h4>
                </li>
            )
        } else {
            return (
                <li className="List-item cursor-pointer" onClickCapture={this.onChange.bind(this, card.id)}>
                    <h4 className="List-item-title px2 py1">{card.name}</h4>
                </li>
            );
        }
    }

    // keep the modal width in sync with the input width :-/
    componentDidUpdate() {
        let { scrollWidth } = ReactDOM.findDOMNode(this.refs.input);
        if (this.state.inputWidth !== scrollWidth) {
            this.setState({ inputWidth: scrollWidth });
        }
    }

    render() {
        let { cardList } = this.props;
        let { isOpen, inputValue, inputWidth } = this.state;

        if (inputValue) {
            let searchString = inputValue.toLowerCase();
            cardList = cardList.filter((card) =>
                ~(card.name || "").toLowerCase().indexOf(searchString) ||
                ~(card.description || "").toLowerCase().indexOf(searchString)
            );
        }

        return (
            <div className="CardPicker flex-full">
                <input
                    ref="input"
                    className="input no-focus full h4 text-bold"
                    placeholder="Type a question name to filter"
                    value={this.inputValue}
                    onFocus={this.onInputFocus}
                    onBlur={this.onInputBlur}
                    onChange={this.onInputChange}
                />
                <Popover
                    isOpen={isOpen && cardList.length > 0}
                    hasArrow={false}
                    tetherOptions={{
                        attachment: "top left",
                        targetAttachment: "bottom left",
                        targetOffset: "0 0"
                    }}
                >
                    <ul className="List rounded bordered text-brand scroll-y scroll-show" style={{ width: inputWidth + "px", maxHeight: "400px" }}>
                        {cardList.map((card) => this.renderItem(card))}
                    </ul>
                </Popover>
            </div>
        );
    }
}
