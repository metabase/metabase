import React, { Component, PropTypes } from "react";

import PulseListItem from "./PulseListItem.jsx";
import WhatsAPulse from "./WhatsAPulse.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";

import { fetchPulses, fetchPulseFormInput } from "../actions";

export default class PulseList extends Component {
    constructor(props, context) {
        super(props, context);
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidMount() {
        this.props.dispatch(fetchPulses());
        this.props.dispatch(fetchPulseFormInput());
    }

    render() {
        let { pulses } = this.props;
        return (
            <div className="PulseList pt3">
                <div className="border-bottom mb2">
                    <div className="wrapper wrapper--trim flex align-center mb2">
                        <h1>Pulses</h1>
                        <a href="/pulse/create" className="PulseButton Button flex-align-right">Create a pulse</a>
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!pulses}>
                { () => pulses.length > 0 ?
                    <ul className="wrapper wrapper--trim">
                        {pulses.map(pulse =>
                            <li key={pulse.id}>
                                <PulseListItem
                                    pulse={pulse}
                                    formInput={this.props.formInput}
                                    dispatch={this.props.dispatch}
                                />
                            </li>
                        )}
                    </ul>
                :
                    <div className="mt4">
                        <WhatsAPulse
                            button={<a href="/pulse/create" className="Button Button--primary">Create a pulse</a>}
                        />
                    </div>
                }
                </LoadingAndErrorWrapper>
            </div>
        );
    }
}
