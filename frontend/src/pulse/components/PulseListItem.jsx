import React, { Component, PropTypes } from "react";

import _ from "underscore";

function formatSchedule(channels) {
    let types = {};
    for (let c of channels) {
        types[c.channel_type] = types[c.channel_type] || [];
        types[c.channel_type].push(c);
    }
    return Object.keys(types).sort().map(type => formatChannel(type, types[type])).join(" and ");
}

function formatChannel(type, channels) {
    switch (type) {
        case "email":
            return "Emailed " + formatList(_.uniq(channels.map(c => c.schedule_type)) );
        case "slack":
            return "Slack'd to " + formatList(channels.map(c => c.details.channel + " " + c.schedule_type))
        default:
            return "Sent to " + type + " " + formatList(_.uniq(channels.map(c => c.schedule_type)));
    }
}

function formatList(list) {
    return list.slice(0, -1).join(", ") + (list.length < 2 ? "" : ", and ") + list[list.length - 1];
}

export default class PulseListItem extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    render() {
        let { pulse } = this.props;
        return (
            <div className="bordered rounded mb3 px4 py3">
                <div className="flex mb2">
                    <div>
                        <h2 className="mb1">{pulse.name}</h2>
                        <span>Pulse by <span className="text-bold">{pulse.creator && pulse.creator.common_name}</span></span>
                    </div>
                    <div className="flex-align-right">
                        { pulse.subscribed ?
                            <button className="Button Button--primary">You recieve this pulse</button>
                        :
                            <button className="Button">Get this pulse</button>
                        }
                        <a href={"/pulse/" + pulse.id} className="Button ml1">Edit</a>
                    </div>
                </div>
                <ol className="mb2 flex">
                    { pulse.cards.map((card, index) =>
                        <li key={index} className="mr1">
                            <a className="Button" href={"/card/"+card.id}>
                                {card.name}
                            </a>
                        </li>
                    )}
                </ol>
                <div>
                    {formatSchedule(pulse.channels)}
                </div>
            </div>
        );
    }
}
