/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { jt, t } from "ttag";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import PulseEditChannels from "metabase/pulse/components/PulseEditChannels";
import { getPulseFormInput } from "metabase/pulse/selectors";
import { getUser } from "metabase/selectors/user";

import { getScheduleFromChannel } from "./schedule";

class AlertEditChannelsInner extends Component {
  componentDidMount() {
    this.props.fetchPulseFormInput();
  }

  // Technically pulse definition is equal to alert definition
  onSetPulse = alert => {
    // If the pulse channel has been added, it PulseEditChannels puts the default schedule to it
    // We want to have same schedule for all channels
    const schedule = getScheduleFromChannel(
      alert.channels.find(c => c.channel_type === "email"),
    );

    this.props.onAlertChange({
      ...alert,
      channels: alert.channels.map(channel => ({ ...channel, ...schedule })),
    });
  };

  render() {
    const { alert, user, users, formInput } = this.props;
    return (
      <div className={cx(CS.mt4, CS.pt2)}>
        <h3
          className={cx(CS.textDark, CS.mb3)}
        >{jt`Where do you want to send these alerts?`}</h3>
        <div className={CS.mb2}>
          <PulseEditChannels
            pulse={alert}
            pulseId={alert.id}
            pulseIsValid={true}
            formInput={formInput}
            user={user}
            users={users}
            setPulse={this.onSetPulse}
            hideSchedulePicker={true}
            emailRecipientText={t`Email alerts to:`}
            invalidRecipientText={domains =>
              t`You're only allowed to email alerts to addresses ending in ${domains}`
            }
          />
        </div>
      </div>
    );
  }
}

export const AlertEditChannels = _.compose(
  Users.loadList(),
  connect(
    (state, props) => ({
      user: getUser(state),
      formInput: getPulseFormInput(state),
    }),
    {
      fetchPulseFormInput,
    },
  ),
)(AlertEditChannelsInner);
