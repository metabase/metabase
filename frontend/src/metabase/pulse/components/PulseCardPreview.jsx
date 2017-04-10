/* eslint "react/prop-types": "warn" */
/*eslint-disable react/no-danger */
import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon.jsx";
import LoadingSpinner from "metabase/components/LoadingSpinner.jsx";

export default class PulseCardPreview extends Component {
    constructor(props, context) {
        super(props, context);
    }

    static propTypes = {
        card: PropTypes.object.isRequired,
        cardPreview: PropTypes.object,
        onRemove: PropTypes.func.isRequired,
        fetchPulseCardPreview: PropTypes.func.isRequired,
    };

    componentWillMount() {
        this.props.fetchPulseCardPreview(this.props.card.id);
    }

    render() {
        let { cardPreview } = this.props;
        return (
            <div className="flex relative flex-full">
                <a className="text-grey-2 absolute" style={{ top: "15px", right: "15px" }} onClick={this.props.onRemove}>
                    <Icon name="close" size={16} />
                </a>
                <div className="bordered rounded flex-full scroll-x" style={{ display: !cardPreview && "none" }} dangerouslySetInnerHTML={{__html: cardPreview && cardPreview.pulse_card_html}} />
                { !cardPreview &&
                    <div className="flex-full flex align-center layout-centered pt1">
                        <LoadingSpinner className="inline-block" />
                    </div>
                }
            </div>
        );
    }
}
