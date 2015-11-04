import React, { Component, PropTypes } from "react";

import PulseModalNamePane from "./PulseModalNamePane.jsx";
import PulseModalCardPane from "./PulseModalCardPane.jsx";
import PulseModalChannelPane from "./PulseModalChannelPane.jsx";

import ModalContent from "metabase/components/ModalContent.jsx";

import cx from "classnames";
import _ from "underscore";

export default class PulseModal extends Component {
    constructor(props) {
        super(props);

        this.state = {
            step: props.initialStep || 0,
            pulse: props.pulse || {
                id: null,
                name: null,
                creator: null,
                cards: [],
                channels: []
            }
        };

        _.bindAll(this, "close", "back", "next", "save", "setPulse");
    }

    static propTypes = {
        onClose: PropTypes.func.isRequired,
        onSave: PropTypes.func.isRequired,
        pulse: PropTypes.object,
        initialStep: PropTypes.number
    };

    close() {
        this.props.onClose();
    }

    save() {
        this.props.onSave(this.state.pulse);
        this.props.onClose();
    }

    back() {
        this.setState({ step: this.state.step - 1 });
    }

    next() {
        this.setState({ step: this.state.step + 1 });
    }

    setPulse(pulse) {
        this.setState({ pulse });
    }

    stepIsValid(step) {
        let { pulse } = this.state;
        switch (step) {
            case 0: return !!pulse.name;
            case 1: return pulse.cards.length > 0;
            case 2: return pulse.channels.length > 0;
        }
    }

    render() {
        let { step, pulse } = this.state;
        return (
            <ModalContent
                title="New pulse"
                closeFn={this.close}
            >
                <div className="flex bordered mx4">
                    <a className="p2 text-centered text-bold flex-full">Name your pulse</a>
                    <a className="p2 text-centered text-bold flex-full">What should we send?</a>
                    <a className="p2 text-centered text-bold flex-full">Where and when?</a>
                </div>
                <div className="mx4">
                    { step === 0 ? <PulseModalNamePane pulse={pulse} setPulse={this.setPulse} />
                    : step === 1 ? <PulseModalCardPane pulse={pulse} setPulse={this.setPulse} />
                    : step === 2 ? <PulseModalChannelPane pulse={pulse} setPulse={this.setPulse} />
                    : <div className="text-error text-centered my4">Error</div> }
                </div>
                <div className="flex align-center m4">
                    { step === 0 ?
                        <a className="text-bold" onClick={this.close}>Cancel</a>
                    :
                        <a className="text-bold" onClick={this.back}>Back</a>
                    }
                    <div className="flex-align-right">
                        { step === 2 ?
                            <a className="Button Button--primary" onClick={this.save}>Done</a>
                        :
                            <a className={cx("Button Button--primary", { "disabled": !this.stepIsValid(step) })} onClick={this.next}>Next</a>
                        }
                    </div>
                </div>
            </ModalContent>
        );
    }
}
