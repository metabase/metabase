import React, { Component } from "react";
import Button from "metabase/components/Button";
import SchedulePicker from "metabase/components/SchedulePicker";

const SPLASH_SCREEN_STEP = "splash"
const SET_SCHEDULE_STEP = "set-schedule"
const ALERT_CREATED_STEP = "alert-created"
export class AlertsModalContent extends Component {
    state = {
        step: SPLASH_SCREEN_STEP,
        schedule: {
            schedule_day: "mon",
            schedule_frame: null,
            schedule_hour: 0,
            schedule_type: "daily"
        }
    }

    proceedFromSplashScreen = () => {
        this.setState({ step: SET_SCHEDULE_STEP })
    }

    setSchedule = (schedule) => {
        this.setState({ schedule })
    }

    createAlert = () => {
        this.setState({ step: ALERT_CREATED_STEP })
    }

    render() {
        const { onCancel } = this.props
        const { step, schedule } = this.state;

        if (step === SPLASH_SCREEN_STEP) {
            return (
                <div className="p2" style={{ minWidth: 340 }}>
                    <h3>Get alerts about this question</h3>
                    <p>We’ll periodically check this saved question, and send an email whenever it returns a result.</p>
                    <Button primary onClick={this.proceedFromSplashScreen}>Get alerts</Button>
                </div>
            )
        }

        if (step === SET_SCHEDULE_STEP) {
            return (
                <div className="p2" style={{ minWidth: 341 }}>
                    <h3>How often should we check?</h3>
                    <p>By default, we’ll check this question for results at the start of every day, at 12:00 AM.</p>
                    <SchedulePicker
                        schedule={schedule}
                        scheduleOptions={["hourly", "daily"]}
                        onScheduleChange={this.setSchedule}
                        textBeforeInterval="Scan"
                    />
                    <Button onClick={onCancel}>Cancel</Button>
                    <Button primary onClick={this.createAlert}>Done</Button>
                </div>
            )
        }

        if (step === ALERT_CREATED_STEP) {
            return (
                <div className="p2" style={{ minWidth: 340 }}>
                    <h3>Your alert is all set up</h3>
                    <p>We’ve sent you a confirmation email, too.</p>
                    <Button primary onClick={this.proceedFromSplashScreen}>Sounds good</Button>
                </div>
            )
        }
    }
}
