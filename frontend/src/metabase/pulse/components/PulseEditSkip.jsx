import React, { Component, PropTypes } from "react";
import ReactDOM from "react-dom";

import Toggle from "metabase/components/Toggle.jsx";

export default class PulseEditSkip extends Component {
    constructor(props) {
        super(props);
        this.state = {};
    }

    static propTypes = {};
    static defaultProps = {};

    toggleSkip(e) {
        let { pulse } = this.props;
        this.props.setPulse({ ...pulse, skip: !e });
        console.log(pulse);
        console.log(e);
    }
    toggleSkip2(e)
    {
        let { pulse } = this.props;
        this.props.setPulse({ ...pulse, skip: !e});
        //console.log("this");
        //console.log(this);
        //console.log(this.props);
        console.log(pulse);
        //console.log({ ...pulse, skip: !e})
        //console.log({ ...pulse, skip: e})
        console.log(e);
        //console.log(this.props.name);
        //console.log("out");
        //console.log({ ...pulse, skip:e});
        //on = !on;
    }

    render() {
        let { pulse } = this.props;
        //console.log(pulse);
        const value = pulse.skip || false;
        const on = value === true;
        return (
            <div className="py1">
                <h2>Skip if no results</h2>
                <p className="mt1 h4 text-bold text-grey-3">Skip pulse if none of the cards have any results.</p>
                <div className="my3">
                    <Toggle value={on} onChange={ () => this.toggleSkip2(on) } />

                </div>
            </div>
        );
    }
}
