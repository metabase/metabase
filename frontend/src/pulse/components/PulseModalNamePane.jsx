import React, { Component, PropTypes } from "react";

import _ from "underscore";

export default class PulseModalNamePane extends Component {
    constructor(props) {
        super(props);
        this.state = {};

        _.bindAll(this, "setName");
    }

    static propTypes = {};
    static defaultProps = {};

    setName(e) {
        let { pulse } = this.props;
        this.props.setPulse({ ...pulse, name: e.target.value });
    }

    render() {
        let { pulse } = this.props;
        return (
            <div className="py4 flex flex-column align-center">
                <h3>Name your pulse</h3>
                <div className="my3">
                    <input className="input" value={pulse.name} onChange={this.setName} />
                </div>
                <p>A pulse is  away for you to send answers to people outside Metabase on a schedule. Start by giving it a name so people will know what they're getting.</p>
            </div>
        );
    }
}
