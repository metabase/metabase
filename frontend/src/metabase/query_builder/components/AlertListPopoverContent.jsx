import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt } from "c-3po";
import _ from "underscore";
import cx from "classnames";
import cxs from "cxs";

import { getQuestionAlerts } from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";
import { deleteAlert, unsubscribeFromAlert } from "metabase/alert/alert";
import {
  AM_PM_OPTIONS,
  DAY_OF_WEEK_OPTIONS,
  HOUR_OPTIONS,
} from "metabase/components/SchedulePicker";
import Icon from "metabase/components/Icon";
import Modal from "metabase/components/Modal";
import {
  CreateAlertModalContent,
  UpdateAlertModalContent,
} from "metabase/query_builder/components/AlertModals";

const unsubscribedClasses = cxs({
  marginLeft: "10px",
});
const ownAlertClasses = cxs({
  marginLeft: "9px",
  marginRight: "17px",
});
const unsubscribeButtonClasses = cxs({
  transform: `translateY(4px)`,
});
const popoverClasses = cxs({
  minWidth: "410px",
});

@connect(
  state => ({ questionAlerts: getQuestionAlerts(state), user: getUser(state) }),
  null,
)
export class AlertListPopoverContent extends Component {
  props: {
    questionAlerts: any[],
    setMenuFreeze: boolean => void,
    closeMenu: () => void,
  };

  state = {
    adding: false,
    hasJustUnsubscribedFromOwnAlert: false,
  };

  onAdd = () => {
    this.props.setMenuFreeze(true);
    this.setState({ adding: true });
  };

  onEndAdding = (closeMenu = false) => {
    this.props.setMenuFreeze(false);
    this.setState({ adding: false });
    if (closeMenu) {
      this.props.closeMenu();
    }
  };

  isCreatedByCurrentUser = alert => {
    const { user } = this.props;
    return alert.creator.id === user.id;
  };

  onUnsubscribe = alert => {
    if (this.isCreatedByCurrentUser(alert)) {
      this.setState({ hasJustUnsubscribedFromOwnAlert: true });
    }
  };

  render() {
    const { questionAlerts, setMenuFreeze, user, closeMenu } = this.props;
    const { adding, hasJustUnsubscribedFromOwnAlert } = this.state;

    const isNonAdmin = !user.is_superuser;
    const [ownAlerts, othersAlerts] = _.partition(
      questionAlerts,
      this.isCreatedByCurrentUser,
    );
    // user's own alert should be shown first if it exists
    const sortedQuestionAlerts = [...ownAlerts, ...othersAlerts];
    const hasOwnAlerts = ownAlerts.length > 0;
    const hasOwnAndOthers = hasOwnAlerts && othersAlerts.length > 0;

    return (
      <div className={popoverClasses}>
        <ul>
          {Object.values(sortedQuestionAlerts).map(alert => (
            <AlertListItem
              alert={alert}
              setMenuFreeze={setMenuFreeze}
              closeMenu={closeMenu}
              highlight={
                isNonAdmin &&
                hasOwnAndOthers &&
                this.isCreatedByCurrentUser(alert)
              }
              onUnsubscribe={this.onUnsubscribe}
            />
          ))}
        </ul>
        {(!hasOwnAlerts || hasJustUnsubscribedFromOwnAlert) && (
          <div className="border-top p2 bg-light-blue">
            <a
              className="link flex align-center text-bold text-small"
              onClick={this.onAdd}
            >
              <Icon name="add" className={ownAlertClasses} />{" "}
              {t`Set up your own alert`}
            </a>
          </div>
        )}
        {adding && (
          <Modal full onClose={this.onEndAdding}>
            <CreateAlertModalContent
              onCancel={this.onEndAdding}
              onAlertCreated={() => this.onEndAdding(true)}
            />
          </Modal>
        )}
      </div>
    );
  }
}

@connect(state => ({ user: getUser(state) }), {
  unsubscribeFromAlert,
  deleteAlert,
})
export class AlertListItem extends Component {
  props: {
    alert: any,
    user: any,
    setMenuFreeze: boolean => void,
    closeMenu: () => void,
    onUnsubscribe: () => void,
  };

  state = {
    unsubscribingProgress: null,
    hasJustUnsubscribed: false,
    editing: false,
  };

  onUnsubscribe = async () => {
    const { alert } = this.props;

    try {
      this.setState({ unsubscribingProgress: t`Unsubscribing...` });
      await this.props.unsubscribeFromAlert(alert);
      this.setState({ hasJustUnsubscribed: true });
      this.props.onUnsubscribe(alert);
    } catch (e) {
      this.setState({ unsubscribingProgress: t`Failed to unsubscribe` });
    }
  };

  onEdit = () => {
    this.props.setMenuFreeze(true);
    this.setState({ editing: true });
  };

  onEndEditing = (shouldCloseMenu = false) => {
    this.props.setMenuFreeze(false);
    this.setState({ editing: false });
    if (shouldCloseMenu) {
      this.props.closeMenu();
    }
  };

  render() {
    const { user, alert, highlight } = this.props;
    const { editing, hasJustUnsubscribed, unsubscribingProgress } = this.state;

    const isAdmin = user.is_superuser;
    const isCurrentUser = alert.creator.id === user.id;

    const emailChannel = alert.channels.find(c => c.channel_type === "email");
    const emailEnabled = emailChannel && emailChannel.enabled;
    const slackChannel = alert.channels.find(c => c.channel_type === "slack");
    const slackEnabled = slackChannel && slackChannel.enabled;

    if (hasJustUnsubscribed) {
      return <UnsubscribedListItem />;
    }

    return (
      <li
        className={cx("flex p3 text-grey-4 border-bottom", {
          "bg-light-blue": highlight,
        })}
      >
        <Icon name="alert" size="20" />
        <div className="full ml2">
          <div className="flex align-top">
            <div>
              <AlertCreatorTitle alert={alert} user={user} />
            </div>
            <div
              className={`${unsubscribeButtonClasses} ml-auto text-bold text-small`}
            >
              {(isAdmin || isCurrentUser) && (
                <a className="link" onClick={this.onEdit}>{jt`Edit`}</a>
              )}
              {!isAdmin &&
                !unsubscribingProgress && (
                  <a
                    className="link ml2"
                    onClick={this.onUnsubscribe}
                  >{jt`Unsubscribe`}</a>
                )}
              {!isAdmin &&
                unsubscribingProgress && <span> {unsubscribingProgress}</span>}
            </div>
          </div>

          {
            // To-do: @kdoh wants to look into overall alignment
          }
          <ul className="flex mt2 text-small">
            <li className="flex align-center">
              <Icon name="clock" size="12" className="mr1" />{" "}
              <AlertScheduleText
                schedule={alert.channels[0]}
                verbose={!isAdmin}
              />
            </li>
            {isAdmin &&
              emailEnabled && (
                <li className="ml3 flex align-center">
                  <Icon name="mail" className="mr1" />
                  {emailChannel.recipients.length}
                </li>
              )}
            {isAdmin &&
              slackEnabled && (
                <li className="ml3 flex align-center">
                  <Icon name="slack" size={16} className="mr1" />
                  {(slackChannel.details &&
                    slackChannel.details.channel.replace("#", "")) ||
                    t`No channel`}
                </li>
              )}
          </ul>
        </div>

        {editing && (
          <Modal full onClose={this.onEndEditing}>
            <UpdateAlertModalContent
              alert={alert}
              onCancel={this.onEndEditing}
              onAlertUpdated={() => this.onEndEditing(true)}
            />
          </Modal>
        )}
      </li>
    );
  }
}

export const UnsubscribedListItem = () => (
  <li className="border-bottom flex align-center py4 text-bold">
    <div className="circle flex align-center justify-center p1 bg-grey-0 ml2">
      <Icon name="check" className="text-success" />
    </div>
    <h3
      className={`${unsubscribedClasses} text-dark`}
    >{jt`Okay, you're unsubscribed`}</h3>
  </li>
);

export class AlertScheduleText extends Component {
  getScheduleText = () => {
    const { schedule, verbose } = this.props;
    const scheduleType = schedule.schedule_type;

    // these are pretty much copy-pasted from SchedulePicker
    if (scheduleType === "hourly") {
      return verbose ? "hourly" : "Hourly";
    } else if (scheduleType === "daily") {
      const hourOfDay = schedule.schedule_hour;
      const hour = _.find(HOUR_OPTIONS, opt => opt.value === hourOfDay % 12)
        .name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      ).name;

      return `${verbose ? "daily at " : "Daily, "} ${hour} ${amPm}`;
    } else if (scheduleType === "weekly") {
      console.log(schedule);
      const hourOfDay = schedule.schedule_hour;
      const day = _.find(
        DAY_OF_WEEK_OPTIONS,
        o => o.value === schedule.schedule_day,
      ).name;
      const hour = _.find(HOUR_OPTIONS, opt => opt.value === hourOfDay % 12)
        .name;
      const amPm = _.find(
        AM_PM_OPTIONS,
        opt => opt.value === (hourOfDay >= 12 ? 1 : 0),
      ).name;

      if (verbose) {
        return `weekly on ${day}s at ${hour} ${amPm}`;
      } else {
        // omit the minute part of time
        return `${day}s, ${hour.substr(0, hour.indexOf(":"))} ${amPm}`;
      }
    }
  };

  render() {
    const { verbose } = this.props;

    const scheduleText = this.getScheduleText();

    if (verbose) {
      return (
        <span>
          Checking <b>{scheduleText}</b>
        </span>
      );
    } else {
      return <span>{scheduleText}</span>;
    }
  }
}

export class AlertCreatorTitle extends Component {
  render() {
    const { alert, user } = this.props;

    const isAdmin = user.is_superuser;
    const isCurrentUser = alert.creator.id === user.id;
    const creator =
      alert.creator.id === user.id ? t`You` : alert.creator.first_name;
    const text =
      !isCurrentUser && !isAdmin
        ? t`You're receiving ${creator}'s alerts`
        : t`${creator} set up an alert`;

    return <h3 className="text-dark">{text}</h3>;
  }
}
