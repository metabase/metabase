import React, { Component, PropTypes } from "react";

import PulseListChannel from "./PulseListChannel.jsx";

export default class PulseListItem extends Component {
    static propTypes = {
        pulse: PropTypes.object.isRequired,
        formInput: PropTypes.object.isRequired
    };

    render() {
        let { pulse, formInput } = this.props;

        return (
            <div className="bordered rounded mb2 pt3">
                <div className="flex px4 mb2">
                    <div>
                        <h2 className="mb1">
                            <a className="no-decoration" href={"/pulse/" + pulse.id}>{pulse.name}</a>
                        </h2>
                        <span>Pulse by <span className="text-bold">{pulse.creator && pulse.creator.common_name}</span></span>
                    </div>
                </div>
                <ol className="mb2 px4 flex">
                    { pulse.cards.map((card, index) =>
                        <li key={index} className="mr1">
                            <a className="Button" href={"/card/"+card.id}>
                                {card.name}
                            </a>
                        </li>
                    )}
                </ol>
                <ul className="border-top px4" style={{backgroundColor: "rgb(252,252,253)"}}>
                    {pulse.channels.map(channel =>
                        <li className="border-row-divider">
                            <PulseListChannel
                                pulse={pulse}
                                channel={channel}
                                channelSpec={formInput.channels && formInput.channels[channel.channel_type]}
                                dispatch={this.props.dispatch}
                            />
                        </li>
                    )}
                </ul>
            </div>
        );
    }
}
