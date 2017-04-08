import React, { Component } from "react";

import PulseListItem from "./PulseListItem.jsx";
import WhatsAPulse from "./WhatsAPulse.jsx";
import SetupModal from "./SetupModal.jsx";

import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper.jsx";
import Modal from "metabase/components/Modal.jsx";

import _ from "underscore";

export default class PulseList extends Component {
    constructor(props, context) {
        super(props, context);

        this.state = {
            showSetupModal: false
        };

        _.bindAll(this, "create");
    }

    static propTypes = {};
    static defaultProps = {};

    componentDidMount() {
        this.props.fetchPulses();
        this.props.fetchPulseFormInput();
    }

    create() {
        let hasConfiguredChannel = !this.props.formInput.channels || _.some(Object.values(this.props.formInput.channels), (c) => c.configured);
        if (hasConfiguredChannel) {
            this.props.onChangeLocation("/pulse/create");
        } else {
            this.setState({ showSetupModal: true });
        }
    }

    render() {
        let { pulses, user } = this.props;
        return (
            <div className="PulseList pt3">
                <div className="border-bottom mb2">
                    <div className="wrapper wrapper--trim flex align-center mb2">
                        <h1>Pulses</h1>
                        <a onClick={this.create} className="PulseButton Button flex-align-right">Create a pulse</a>
                    </div>
                </div>
                <LoadingAndErrorWrapper loading={!pulses}>
                { () => pulses.length > 0 ?
                    <ul className="wrapper wrapper--trim">
                        {pulses.slice().sort((a,b) => b.created_at - a.created_at).map(pulse =>
                            <li key={pulse.id}>
                                <PulseListItem
                                    scrollTo={pulse.id === this.props.pulseId}
                                    pulse={pulse}
                                    user={user}
                                    formInput={this.props.formInput}
                                    savePulse={this.props.savePulse}
                                />
                            </li>
                        )}
                    </ul>
                :
                    <div className="mt4 ml-auto mr-auto">
                        <WhatsAPulse
                            button={<a onClick={this.create} className="Button Button--primary">Create a pulse</a>}
                        />
                    </div>
                }
                </LoadingAndErrorWrapper>
                <Modal isOpen={this.state.showSetupModal}>
                    <SetupModal
                        user={user}
                        onClose={() => this.setState({ showSetupModal: false })}
                        onChangeLocation={this.props.onChangeLocation}
                    />
                </Modal>
            </div>
        );
    }
}
