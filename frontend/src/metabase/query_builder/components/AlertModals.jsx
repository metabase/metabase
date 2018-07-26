import React, { Component } from "react";
import { connect } from "react-redux";
import { t, jt, ngettext, msgid } from "c-3po";
import _ from "underscore";
import cxs from "cxs";

// components
import Button from "metabase/components/Button";
import SchedulePicker from "metabase/components/SchedulePicker";
import ModalContent from "metabase/components/ModalContent";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import Radio from "metabase/components/Radio";
import Icon from "metabase/components/Icon";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import PulseEditChannels from "metabase/pulse/components/PulseEditChannels";
import RetinaImage from "react-retina-image";

// actions
import { createAlert, deleteAlert, updateAlert } from "metabase/alert/alert";
import { apiUpdateQuestion } from "metabase/query_builder/actions";
import { fetchPulseFormInput, fetchUsers } from "metabase/pulse/actions";

// selectors
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import {
  formInputSelector,
  hasConfiguredAnyChannelSelector,
  hasConfiguredEmailChannelSelector,
  hasLoadedChannelInfoSelector,
  userListSelector,
} from "metabase/pulse/selectors";

// lib
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  getDefaultAlert,
} from "metabase-lib/lib/Alert";
import MetabaseCookies from "metabase/lib/cookies";
import MetabaseAnalytics from "metabase/lib/analytics";

// types
import type { AlertType } from "metabase-lib/lib/Alert";

const getScheduleFromChannel = channel =>
  _.pick(
    channel,
    "schedule_day",
    "schedule_frame",
    "schedule_hour",
    "schedule_type",
  );
const classes = cxs({
  width: "162px",
});

@connect(
  state => ({
    question: getQuestion(state),
    visualizationSettings: getVisualizationSettings(state),
    isAdmin: getUserIsAdmin(state),
    user: getUser(state),
    hasLoadedChannelInfo: hasLoadedChannelInfoSelector(state),
    hasConfiguredAnyChannel: hasConfiguredAnyChannelSelector(state),
    hasConfiguredEmailChannel: hasConfiguredEmailChannelSelector(state),
  }),
  { createAlert, fetchPulseFormInput, apiUpdateQuestion },
)
export class CreateAlertModalContent extends Component {
  props: {
    onCancel: () => void,
    onAlertCreated: () => void,
  };

  constructor(props) {
    super();

    const { question, user, visualizationSettings } = props;

    this.state = {
      hasSeenEducationalScreen: MetabaseCookies.getHasSeenAlertSplash(),
      alert: getDefaultAlert(question, user, visualizationSettings),
    };
  }

  componentWillReceiveProps(newProps) {
    // NOTE Atte Keinänen 11/6/17: Don't fill in the card information yet
    // Because `onCreate` and `onSave` of QueryHeader mix Redux action dispatches and `setState` calls,
    // we don't have up-to-date card information in the constructor yet
    // TODO: Refactor QueryHeader so that `onCreate` and `onSave` only call Redux actions and don't modify the local state
    if (this.props.question !== newProps.question) {
      this.setState({
        alert: {
          ...this.state.alert,
          card: { id: newProps.question.id() },
        },
      });
    }
  }

  componentWillMount() {
    // loads the channel information
    this.props.fetchPulseFormInput();
  }

  onAlertChange = alert => this.setState({ alert });

  onCreateAlert = async () => {
    const { createAlert, apiUpdateQuestion, onAlertCreated } = this.props;
    const { alert } = this.state;

    // Resave the question here (for persisting the x/y axes; see #6749)
    await apiUpdateQuestion();

    await createAlert(alert);

    // should close be triggered manually like this
    // but the creation notification would appear automatically ...?
    // OR should the modal visibility be part of QB redux state
    // (maybe check how other modals are implemented)
    onAlertCreated();

    MetabaseAnalytics.trackEvent("Alert", "Create", alert.alert_condition);
  };

  proceedFromEducationalScreen = () => {
    MetabaseCookies.setHasSeenAlertSplash(true);
    this.setState({ hasSeenEducationalScreen: true });
  };

  render() {
    const {
      question,
      visualizationSettings,
      onCancel,
      hasConfiguredAnyChannel,
      hasConfiguredEmailChannel,
      isAdmin,
      user,
      hasLoadedChannelInfo,
    } = this.props;
    const { alert, hasSeenEducationalScreen } = this.state;

    const channelRequirementsMet = isAdmin
      ? hasConfiguredAnyChannel
      : hasConfiguredEmailChannel;

    if (hasLoadedChannelInfo && !channelRequirementsMet) {
      return (
        <ChannelSetupModal
          user={user}
          onClose={onCancel}
          entityNamePlural={t`alerts`}
          channels={isAdmin ? ["email", "Slack"] : ["email"]}
          fullPageModal
        />
      );
    }
    if (!hasSeenEducationalScreen) {
      return (
        <ModalContent onClose={onCancel}>
          <AlertEducationalScreen
            onProceed={this.proceedFromEducationalScreen}
          />
        </ModalContent>
      );
    }

    // TODO: Remove PulseEdit css hack
    return (
      <ModalContent onClose={onCancel}>
        <div
          className="PulseEdit ml-auto mr-auto mb4"
          style={{ maxWidth: "550px" }}
        >
          <AlertModalTitle text={t`Let's set up your alert`} />
          <AlertEditForm
            alertType={question.alertType(visualizationSettings)}
            alert={alert}
            onAlertChange={this.onAlertChange}
          />
          <div className="flex align-center mt4">
            <div className="flex-full" />
            <Button onClick={onCancel} className="mr2">{t`Cancel`}</Button>
            <ButtonWithStatus
              titleForState={{ default: t`Done` }}
              onClickOperation={this.onCreateAlert}
            />
          </div>
        </div>
      </ModalContent>
    );
  }
}

export class AlertEducationalScreen extends Component {
  props: {
    onProceed: () => void,
  };

  render() {
    const { onProceed } = this.props;

    return (
      <div className="pt2 pb4 ml-auto mr-auto text-centered">
        <div className="pt4">
          <h1 className="mb1 text-dark">{t`The wide world of alerts`}</h1>
          <h3 className="mb4 text-normal text-dark">{t`There are a few different kinds of alerts you can get`}</h3>
        </div>
        {
          // @mazameli: needed to do some negative margin spacing to match the designs
        }
        <div className="text-normal pt3">
          <div
            className="relative flex align-center pr4"
            style={{ marginLeft: -80 }}
          >
            <RetinaImage src="app/assets/img/alerts/education-illustration-01-raw-data.png" />
            <p
              className={`${classes} ml2 text-left`}
            >{jt`When a raw data question ${(
              <strong>{t`returns any results`}</strong>
            )}`}</p>
          </div>
          <div
            className="relative flex align-center flex-reverse pl4"
            style={{ marginTop: -50, marginRight: -80 }}
          >
            <RetinaImage src="app/assets/img/alerts/education-illustration-02-goal.png" />
            <p
              className={`${classes} mr2 text-right`}
            >{jt`When a line or bar ${(
              <strong>{t`crosses a goal line`}</strong>
            )}`}</p>
          </div>
          <div
            className="relative flex align-center"
            style={{ marginTop: -60, marginLeft: -55 }}
          >
            <RetinaImage src="app/assets/img/alerts/education-illustration-03-progress.png" />
            <p
              className={`${classes} ml2 text-left`}
            >{jt`When a progress bar ${(
              <strong>{t`reaches its goal`}</strong>
            )}`}</p>
          </div>
        </div>
        <Button
          primary
          className="mt4"
          onClick={onProceed}
        >{t`Set up an alert`}</Button>
      </div>
    );
  }
}

@connect(
  state => ({
    user: getUser(state),
    isAdmin: getUserIsAdmin(state),
    question: getQuestion(state),
    visualizationSettings: getVisualizationSettings(state),
  }),
  { apiUpdateQuestion, updateAlert, deleteAlert },
)
export class UpdateAlertModalContent extends Component {
  props: {
    alert: any,
    onCancel: boolean,
    onAlertUpdated: any => void,
    updateAlert: any => void,
    deleteAlert: any => void,
    isAdmin: boolean,
  };

  constructor(props) {
    super();
    this.state = {
      modifiedAlert: props.alert,
    };
  }

  onAlertChange = modifiedAlert => this.setState({ modifiedAlert });

  onUpdateAlert = async () => {
    const { apiUpdateQuestion, updateAlert, onAlertUpdated } = this.props;
    const { modifiedAlert } = this.state;

    // Resave the question here (for persisting the x/y axes; see #6749)
    await apiUpdateQuestion();

    await updateAlert(modifiedAlert);
    onAlertUpdated();

    MetabaseAnalytics.trackEvent(
      "Alert",
      "Update",
      modifiedAlert.alert_condition,
    );
  };

  onDeleteAlert = async () => {
    const { alert, deleteAlert, onAlertUpdated } = this.props;
    await deleteAlert(alert.id);
    onAlertUpdated();
  };

  render() {
    const {
      onCancel,
      question,
      visualizationSettings,
      alert,
      user,
      isAdmin,
    } = this.props;
    const { modifiedAlert } = this.state;

    const isCurrentUser = alert.creator.id === user.id;
    const title = isCurrentUser ? t`Edit your alert` : t`Edit alert`;
    // TODO: Remove PulseEdit css hack
    return (
      <ModalContent onClose={onCancel}>
        <div
          className="PulseEdit ml-auto mr-auto mb4"
          style={{ maxWidth: "550px" }}
        >
          <AlertModalTitle text={title} />
          <AlertEditForm
            alertType={question.alertType(visualizationSettings)}
            alert={modifiedAlert}
            onAlertChange={this.onAlertChange}
          />
          {isAdmin && (
            <DeleteAlertSection
              alert={alert}
              onDeleteAlert={this.onDeleteAlert}
            />
          )}

          <div className="flex align-center mt4">
            <div className="flex-full" />
            <Button onClick={onCancel} className="mr2">{t`Cancel`}</Button>
            <ButtonWithStatus
              titleForState={{ default: t`Save changes` }}
              onClickOperation={this.onUpdateAlert}
            />
          </div>
        </div>
      </ModalContent>
    );
  }
}

export class DeleteAlertSection extends Component {
  deleteModal: any;

  getConfirmItems() {
    // same as in PulseEdit but with some changes to copy
    return this.props.alert.channels.map(
      c =>
        c.channel_type === "email" ? (
          <span>{jt`This alert will no longer be emailed to ${(
            <strong>
              {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
                c.recipients.length,
              )}
            </strong>
          )}.`}</span>
        ) : c.channel_type === "slack" ? (
          <span>{jt`Slack channel ${(
            <strong>{c.details && c.details.channel}</strong>
          )} will no longer get this alert.`}</span>
        ) : (
          <span>{jt`Channel ${(
            <strong>{c.channel_type}</strong>
          )} will no longer receive this alert.`}</span>
        ),
    );
  }

  render() {
    const { onDeleteAlert } = this.props;

    return (
      <div className="DangerZone mt4 pt4 mb2 p3 rounded bordered relative">
        <h3
          className="text-error absolute top bg-white px1"
          style={{ marginTop: "-12px" }}
        >{jt`Danger Zone`}</h3>
        <div className="ml1">
          <h4 className="text-bold mb1">{jt`Delete this alert`}</h4>
          <div className="flex">
            <p className="h4 pr2">{jt`Stop delivery and delete this alert. There's no undo, so be careful.`}</p>
            <ModalWithTrigger
              ref={ref => (this.deleteModal = ref)}
              triggerClasses="Button Button--danger flex-align-right flex-no-shrink"
              triggerElement="Delete this Alert"
            >
              <DeleteModalWithConfirm
                objectType="alert"
                title={t`Delete this alert?`}
                confirmItems={this.getConfirmItems()}
                onClose={() => this.deleteModal.close()}
                onDelete={onDeleteAlert}
              />
            </ModalWithTrigger>
          </div>
        </div>
      </div>
    );
  }
}

const AlertModalTitle = ({ text }) => (
  <div className="ml-auto mr-auto my4 pb2 text-centered">
    <RetinaImage
      className="mb3"
      src="app/assets/img/alerts/alert-bell-confetti-illustration.png"
    />
    <h1 className="text-dark">{text}</h1>
  </div>
);

@connect(state => ({ isAdmin: getUserIsAdmin(state) }), null)
export class AlertEditForm extends Component {
  props: {
    alertType: AlertType,
    alert: any,
    onAlertChange: any => void,
    isAdmin: boolean,
  };

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

export const AlertGoalToggles = ({ alertType, alert, onAlertChange }) => {
  const isTimeseries = alertType === ALERT_TYPE_TIMESERIES_GOAL;
  const isProgress = alertType === ALERT_TYPE_PROGRESS_BAR_GOAL;

  if (!isTimeseries && !isProgress) {
    // not a goal alert
    return null;
  }

  return (
    <div>
      <AlertAboveGoalToggle
        alert={alert}
        onAlertChange={onAlertChange}
        title={
          isTimeseries
            ? t`Alert me when the line…`
            : t`Alert me when the progress bar…`
        }
        trueText={
          isTimeseries ? t`Goes above the goal line` : t`Reaches the goal`
        }
        falseText={
          isTimeseries ? t`Goes below the goal line` : t`Goes below the goal`
        }
      />
      <AlertFirstOnlyToggle
        alert={alert}
        onAlertChange={onAlertChange}
        title={
          isTimeseries
            ? t`The first time it crosses, or every time?`
            : t`The first time it reaches the goal, or every time?`
        }
        trueText={t`The first time`}
        falseText={t`Every time`}
      />
    </div>
  );
};

export const AlertAboveGoalToggle = props => (
  <AlertSettingToggle {...props} setting="alert_above_goal" />
);

export const AlertFirstOnlyToggle = props => (
  <AlertSettingToggle {...props} setting="alert_first_only" />
);

export const AlertSettingToggle = ({
  alert,
  onAlertChange,
  title,
  trueText,
  falseText,
  setting,
}) => (
  <div className="mb4 pb2">
    <h3 className="text-dark mb1">{title}</h3>
    <Radio
      value={alert[setting]}
      onChange={value => onAlertChange({ ...alert, [setting]: value })}
      options={[
        { name: trueText, value: true },
        { name: falseText, value: false },
      ]}
    />
  </div>
);

export class AlertEditSchedule extends Component {
  render() {
    const { alertType, schedule } = this.props;

    return (
      <div>
        <h3 className="mt4 mb3 text-dark">
          How often should we check for results?
        </h3>

        <div className="bordered rounded mb2">
          {alertType === ALERT_TYPE_ROWS && <RawDataAlertTip />}
          <div className="p3 bg-light">
            <SchedulePicker
              schedule={schedule}
              scheduleOptions={["hourly", "daily", "weekly"]}
              onScheduleChange={this.props.onScheduleChange}
              textBeforeInterval="Check"
            />
          </div>
        </div>
      </div>
    );
  }
}

@connect(
  state => ({
    user: getUser(state),
    userList: userListSelector(state),
    formInput: formInputSelector(state),
  }),
  { fetchPulseFormInput, fetchUsers },
)
export class AlertEditChannels extends Component {
  props: {
    onChannelsChange: any => void,
    user: any,
    userList: any[],
    // this stupidly named property contains different channel options, nothing else
    formInput: any,
    fetchPulseFormInput: () => void,
    fetchUsers: () => void,
  };

  componentDidMount() {
    this.props.fetchPulseFormInput();
    this.props.fetchUsers();
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
    const { alert, user, userList, formInput } = this.props;
    return (
      <div className="mt4 pt2">
        <h3 className="text-dark mb3">{jt`Where do you want to send these alerts?`}</h3>
        <div className="mb2">
          <PulseEditChannels
            pulse={alert}
            pulseId={alert.id}
            pulseIsValid={true}
            formInput={formInput}
            user={user}
            userList={userList}
            setPulse={this.onSetPulse}
            hideSchedulePicker={true}
            emailRecipientText={t`Email alerts to:`}
          />
        </div>
      </div>
    );
  }
}

// TODO: Not sure how to translate text with formatting properly
@connect(state => ({
  question: getQuestion(state),
  visualizationSettings: getVisualizationSettings(state),
}))
export class RawDataAlertTip extends Component {
  render() {
    const display = this.props.question.display();
    const vizSettings = this.props.visualizationSettings;
    const goalEnabled = vizSettings["graph.show_goal"];
    const isLineAreaBar =
      display === "line" || display === "area" || display === "bar";
    const isMultiSeries =
      isLineAreaBar &&
      vizSettings["graph.metrics"] &&
      vizSettings["graph.metrics"].length > 1;
    const showMultiSeriesGoalAlert = goalEnabled && isMultiSeries;

    return (
      <div className="border-row-divider p3 flex align-center">
        <div className="circle flex align-center justify-center bg-light p2 mr2 text-medium">
          <Icon name="lightbulb" size="20" />
        </div>
        {showMultiSeriesGoalAlert ? (
          <MultiSeriesAlertTip />
        ) : (
          <NormalAlertTip />
        )}
      </div>
    );
  }
}

export const MultiSeriesAlertTip = () => (
  <div>{jt`${(
    <strong>{t`Heads up`}:</strong>
  )} Goal-based alerts aren't yet supported for charts with more than one line, so this alert will be sent whenever the chart has ${(
    <em>{t`results`}</em>
  )}.`}</div>
);
export const NormalAlertTip = () => (
  <div>{jt`${(
    <strong>{t`Tip`}:</strong>
  )} This kind of alert is most useful when your saved question doesn’t ${(
    <em>{t`usually`}</em>
  )} return any results, but you want to know when it does.`}</div>
);
