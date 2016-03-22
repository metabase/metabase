import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import cx from "classnames";

import Urls from "metabase/lib/urls";
import PulseListChannel from "./PulseListChannel.jsx";

export default class PulseListItem extends Component {
    static propTypes = {
        pulse: PropTypes.object.isRequired,
        formInput: PropTypes.object.isRequired,
        user: PropTypes.object.isRequired
    };

    componentDidMount() {
        if (this.props.scrollTo) {
            const element = ReactDOM.findDOMNode(this.refs.pulseListItem);
            element.scrollIntoView(true);
        }
    }

    render() {
        let { pulse, formInput, user } = this.props;

        return (
            <div ref="pulseListItem" className={cx("PulseListItem bordered rounded mb2 pt3", {"PulseListItem--focused": this.props.scrollTo})}>
                <div className="flex px4 mb2">
                    <div>
                        <h2 className="mb1">{pulse.name}</h2>
                        <span>Pulse by <span className="text-bold">{pulse.creator && pulse.creator.common_name}</span></span>
                    </div>
                    <div className="flex-align-right">
                        <a className="PulseEditButton PulseButton Button no-decoration text-bold" href={"/pulse/" + pulse.id}>Edit</a>
                    </div>
                </div>
                <ol className="mb2 px4 flex flex-wrap">
                    { pulse.cards.map((card, index) =>
                        <li key={index} className="mr1 mb1">
                            <a className="Button" href={Urls.card(card.id)}>
                                {card.name}
                            </a>
                        </li>
                    )}
                </ol>
                <ul className="border-top px4 bg-grey-0">
                    {pulse.channels.map(channel =>
                        <li className="border-row-divider">
                            <PulseListChannel
                                pulse={pulse}
                                channel={channel}
                                channelSpec={formInput.channels && formInput.channels[channel.channel_type]}
                                dispatch={this.props.dispatch}
                                user={user}
                            />
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
