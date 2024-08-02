/* eslint-disable react/prop-types */
import { Component } from "react";
import { connect } from "react-redux";

import { getUserIsAdmin } from "metabase/selectors/user";

import { AlertEditChannels } from "./AlertEditChannels";
import { AlertEditSchedule } from "./AlertEditSchedule";
import { AlertGoalToggles } from "./AlertGoalToggles";
import { getScheduleFromChannel } from "./schedule";

class AlertEditFormInner extends Component {
  onScheduleChange = schedule => {
    const { alert, onAlertChange } = this.props;

    // update the same schedule to all channels at once
    onAlertChange({
      ...alert,
      channels: alert.channels.map(channel => ({ ...channel, ...schedule })),
    });
  };

  render() {
    const { alertType, alert, isAdmin, onAlertChange } = this.props;

    // the schedule should be same for all channels so we can use the first one
    const schedule = getScheduleFromChannel(alert.channels[0]);

    return (
      <div>
        <AlertGoalToggles
          alertType={alertType}
          alert={alert}
          onAlertChange={onAlertChange}
        />
        <AlertEditSchedule
          alert={alert}
          alertType={alertType}
          schedule={schedule}
          onScheduleChange={this.onScheduleChange}
        />
        {isAdmin && (
          <AlertEditChannels alert={alert} onAlertChange={onAlertChange} />
        )}
      </div>
    );
  }
}

export const AlertEditForm = connect(
  state => ({ isAdmin: getUserIsAdmin(state) }),
  null,
)(AlertEditFormInner);
