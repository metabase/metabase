import React, { Component, PropTypes } from "react";

import Icon from "metabase/components/Icon.jsx";

import { fetchPulseCardPreview } from "../actions";

export default class PulseCardPreview extends Component {
    constructor(props, context) {
        super(props, context);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        cardPreviews: PropTypes.object.isRequired,
        onRemove: PropTypes.func.isRequired
    };

    componentWillMount() {
        this.props.dispatch(fetchPulseCardPreview(this.props.card.id));
    }

    getWarning(cardPreview) {
        if (!cardPreview) {
            return null;
        }

        if (cardPreview.pulse_card_type === "bar" && cardPreview.row_count > 10) {
            return "This is a large table and we'll have to crop it to use it in a pulse. The max size that can be displayed is 2 columns and 10 rows.";
        }
        if (cardPreview.pulse_card_type == null) {
            return "We are unable to display this card in a pulse";
        }
        return null;
    }

    render() {
        let { card, cardPreviews } = this.props;
        let cardPreview = cardPreviews[card.id];
        let warning = this.getWarning(cardPreview);
        return (
            <div className="flex relative flex-full">
                <a className="text-grey-2 absolute" style={{ top: "15px", right: "15px" }} onClick={this.props.onRemove}>
                    <Icon name="close" width={16} height={16} />
                </a>
                <div className="bordered rounded flex-full" dangerouslySetInnerHTML={{__html: cardPreview && cardPreview.pulse_card_html}} />
                { warning &&
                    <div className="text-gold border-gold border-left absolute mt1 ml3 pl3" style={{ left: "100%", width: "400px", borderWidth: "3px" }}>
                        <h3 className="mb1">Heads up</h3>
                        <div className=" h4 text-bold">{warning}</div>
                    </div>
                }
            </div>
        );
    }
}
