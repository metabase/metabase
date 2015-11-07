import React, { Component, PropTypes } from "react";

import _ from "underscore";

export default class PulseEditName extends Component {
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
            <div className="py4">
                <h2>Name your pulse</h2>
                <p>Give your pulse a name to help others understand what it's about.</p>
                <div className="my3">
                    <input className="input" value={pulse.name} onChange={this.setName} />
                </div>
            </div>
        );
    }
}
