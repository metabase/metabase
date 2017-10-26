import React, { Component } from "react";
import Button from "metabase/components/Button";
import SchedulePicker from "metabase/components/SchedulePicker";
import { connect } from "react-redux";
import { createAlert, updateAlert } from "metabase/query_builder/actions";
import ModalContent from "metabase/components/ModalContent";
import { getUserIsAdmin } from "metabase/selectors/user";

@connect(null, { createAlert })
export class CreateAlertModalContent extends Component {
    // contains the first-time educational screen
    // ModalContent, parent uses ModalWithTrigger
    props: {
        onClose: boolean
    }

    state = {
        // the default configuration for a new alert
        alert: {
            schedule: {
                schedule_day: "mon",
                schedule_frame: null,
                schedule_hour: 0,
                schedule_type: "daily"
            }
        },
        hasSeenEducationalScreen: true
    }

    onAlertChange = (alert) => this.setState({ alert })

    onCreateAlert = async () => {
        const { createAlert, onClose } = this.props
        const { alert } = this.state
        await createAlert(alert)
        // should close be triggered manually like this
        // but the creation notification would appear automatically ...?
        // OR should the modal visibility be part of QB redux state
        // (maybe check how other modals are implemented)
        onClose()
    }

    proceedFromEducationalScreen = () => {
        // TODO: how to save that educational screen has been seen? Should come from Redux state
        this.setState({ hasSeenEducationalScreen: true })
    }

    render() {
        const { onClose } = this.props
        const { alert } = this.state

        if (!this.state.hasSeenEducationalScreen) {
            return (
                <ModalContent onClose={onClose}>
                    <AlertEducationalScreen onProceed={this.proceedFromEducationalScreen} />
                </ModalContent>
            )
        }

        // TODO: Remove PulseEdit css hack
        return (
            <ModalContent
                onClose={onClose}
            >
                <div className="PulseEdit ml-auto mr-auto" style={{maxWidth: "550px"}}>
                    <AlertModalTitle text="Let's set up your alert" />
                    <AlertEditForm
                        alert={alert}
                        onAlertChange={this.onAlertChange}
                        onDone={this.onCreateAlert}
                    />
                    <Button onClick={onClose}>Cancel</Button>
                    <Button primary onClick={this.onCreateAlert}>Done</Button>
                </div>
            </ModalContent>
        )
    }
}

export class AlertEducationalScreen extends Component {
    props: {
        onProceed: () => void
    }

    render() {
        const { onProceed } = this.props;

        return (
            <div className="pt2 ml-auto mr-auto text-centered">
                <div className="pt4">
                    <h1>The wide world of alerts</h1>
                    <h2>There are a few different kinds of alerts you can get</h2>
                </div>
                <p>[ the educational image comes here ]</p>
                <Button primary onClick={onProceed}>Set up an alert</Button>
            </div>
        )
    }
}

@connect(null, { updateAlert })
export class UpdateAlertModalContent extends Component {
    props: {
        onClose: boolean
    }
    // contains the deletion button
    // ModalContent, parent uses ModalWithTrigger

    onUpdateAlert = (alert) => {
        const { updateAlert, onClose } = this.props

        updateAlert(alert)
        onClose()
    }

    render() {
        const { onClose } = this.props

        return (
            <ModalContent
                title={<AlertModalTitle text="Edit your alert" />}
                onClose={onClose}
            >
                <AlertEditForm onDone={this.onCreateAlert} />
                <Button className="mr2" onClick={onClose}>Cancel</Button>
                <Button primary onClick={this.onUpdateAlert}>Save changes</Button>
            </ModalContent>
        )
    }
}

const AlertModalTitle = ({ text }) =>
    <div className="ml-auto mr-auto mt2 mb4 text-centered">
        <p>[edit alert icon comes here]</p>
        <h2>{ text }</h2>
    </div>

@connect((state) => ({ isAdmin: getUserIsAdmin(state) }), null)
export class AlertEditForm extends Component {
    props: {
        alert: any,
        onAlertChange: (any) => void,
        isAdmin: boolean
    }

    onScheduleChange = (schedule) => {
        const { alert, onAlertChange } = this.props;
        onAlertChange({ ...alert, schedule })
    }

    render() {
        const { alert, isAdmin } = this.props

        return (
            <div>
                <AlertEditSchedule
                    schedule={alert.schedule}
                    onScheduleChange={this.onScheduleChange}
                />
                { isAdmin && <AlertEditChannels /> }
            </div>
        )
    }
}

export class AlertEditSchedule extends Component {
    render() {
        const { schedule } = this.props;

        return (
            <div>
                <h3>How often should we check for results?</h3>

                <div className="bordered rounded mb2">
                    <RawDataAlertTip />
                    <div className="p3 bg-grey-0">
                        <SchedulePicker
                            schedule={schedule}
                            scheduleOptions={["hourly", "daily"]}
                            onScheduleChange={this.props.onScheduleChange}
                            textBeforeInterval="Check"
                        />
                    </div>
                </div>
            </div>
        )
    }
}

export class AlertEditChannels extends Component {
    render() {
        return (
            <div>
                <h3>Where do you want to send these alerts?</h3>
                <div className="bordered rounded mb2">
                    <div className="p3 bg-grey-0">
                        [channels come here, pretty much replicating the pulse channels form or even reusing a generalized version of PulseEditChannels]
                    </div>
                </div>
            </div>
        )
    }
}

const RawDataAlertTip = () =>
    <div className="border-row-divider p3">
        <b>Tip:</b> This kind of alert is most useful when your saved question doesn’t <em>usually</em> return any results, but you want to know when it does.
    </div>
