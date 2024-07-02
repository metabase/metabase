/* eslint-disable react/prop-types */
/* eslint-disable  react/jsx-key */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t, jt, ngettext, msgid } from "ttag";
import _ from "underscore";

import { createAlert, deleteAlert, updateAlert } from "metabase/alert/alert";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import ModalContent from "metabase/components/ModalContent";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import SchedulePicker from "metabase/containers/SchedulePicker";
import Button from "metabase/core/components/Button";
import Radio from "metabase/core/components/Radio";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import Users from "metabase/entities/users";
import { alertIsValid } from "metabase/lib/alert";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseCookies from "metabase/lib/cookies";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import PulseEditChannels from "metabase/pulse/components/PulseEditChannels";
import {
  getPulseFormInput,
  hasConfiguredAnyChannelSelector,
  hasConfiguredEmailChannelSelector,
  hasLoadedChannelInfoSelector,
} from "metabase/pulse/selectors";
import { apiUpdateQuestion, updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";
import { Icon } from "metabase/ui";
import {
  ALERT_TYPE_PROGRESS_BAR_GOAL,
  ALERT_TYPE_ROWS,
  ALERT_TYPE_TIMESERIES_GOAL,
  getDefaultAlert,
} from "metabase-lib/v1/Alert";

import AlertModalsS from "./AlertModals.module.css";
import { AlertModalFooter, DangerZone } from "./AlertModals.styled";

const getScheduleFromChannel = channel =>
  _.pick(
    channel,
    "schedule_day",
    "schedule_frame",
    "schedule_hour",
    "schedule_type",
  );
const textStyle = {
  width: "162px",
};

class CreateAlertModalContentInner extends Component {
  constructor(props) {
    super();

    const { question, user, visualizationSettings } = props;

    this.state = {
      hasSeenEducationalScreen: MetabaseCookies.getHasSeenAlertSplash(),
      alert: getDefaultAlert(question, user, visualizationSettings),
    };
  }

  UNSAFE_componentWillReceiveProps(newProps) {
    // NOTE Atte Keinänen 11/6/17: Don't fill in the card information yet
    // Because `onCreate` and `onSave` of QueryHeader mix Redux action dispatches and `setState` calls,
    // we don't have up-to-date card information in the constructor yet
    // TODO: Refactor QueryHeader so that `onCreate` and `onSave` only call Redux actions and don't modify the local state
    if (this.props.question !== newProps.question) {
      this.setState({
        alert: {
          ...this.state.alert,
          card: { ...this.state.alert.card, id: newProps.question.id() },
        },
      });
    }
  }

  UNSAFE_componentWillMount() {
    // loads the channel information
    this.props.fetchPulseFormInput();
  }

  onAlertChange = alert => this.setState({ alert });

  onCreateAlert = async () => {
    const { question, createAlert, updateUrl, onAlertCreated } = this.props;
    const { alert } = this.state;

    await createAlert(alert);
    await updateUrl(question, { dirty: false });

    onAlertCreated();
    MetabaseAnalytics.trackStructEvent(
      "Alert",
      "Create",
      alert.alert_condition,
    );
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
    const isValid = alertIsValid(alert);

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
        <ModalContent onClose={onCancel} data-testid="alert-education-screen">
          <AlertEducationalScreen
            onProceed={this.proceedFromEducationalScreen}
          />
        </ModalContent>
      );
    }

    // TODO: Remove PulseEdit css hack
    return (
      <ModalContent data-testid="alert-create" onClose={onCancel}>
        <div
          className={cx(CS.mlAuto, CS.mrAuto, CS.mb4)}
          style={{ maxWidth: "550px" }}
        >
          <AlertModalTitle text={t`Let's set up your alert`} />
          <AlertEditForm
            alertType={question.alertType(visualizationSettings)}
            alert={alert}
            onAlertChange={this.onAlertChange}
          />
          <AlertModalFooter>
            <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
            <ButtonWithStatus
              titleForState={{ default: t`Done` }}
              disabled={!isValid}
              onClickOperation={this.onCreateAlert}
            />
          </AlertModalFooter>
        </div>
      </ModalContent>
    );
  }
}

export const CreateAlertModalContent = connect(
  state => ({
    question: getQuestion(state),
    visualizationSettings: getVisualizationSettings(state),
    isAdmin: getUserIsAdmin(state),
    user: getUser(state),
    hasLoadedChannelInfo: hasLoadedChannelInfoSelector(state),
    hasConfiguredAnyChannel: hasConfiguredAnyChannelSelector(state),
    hasConfiguredEmailChannel: hasConfiguredEmailChannelSelector(state),
  }),
  { createAlert, fetchPulseFormInput, apiUpdateQuestion, updateUrl },
)(CreateAlertModalContentInner);

export class AlertEducationalScreen extends Component {
  render() {
    const { onProceed } = this.props;

    return (
      <div
        className={cx(CS.pt2, CS.pb4, CS.mlAuto, CS.mrAuto, CS.textCentered)}
      >
        <div className={CS.pt4}>
          <h1
            className={cx(CS.mb1, CS.textDark)}
          >{t`The wide world of alerts`}</h1>
          <h3
            className={cx(CS.mb4, CS.textNormal, CS.textDark)}
          >{t`There are a few different kinds of alerts you can get`}</h3>
        </div>
        {
          // @mazameli: needed to do some negative margin spacing to match the designs
        }
        <div className={cx(CS.textNormal, CS.pt3)}>
          <div
            className={cx(CS.relative, CS.flex, CS.alignCenter, CS.pr4)}
            style={{ marginLeft: -80 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-01-raw-data.png"
              srcSet="
                app/assets/img/alerts/education-illustration-01-raw-data.png    1x,
                app/assets/img/alerts/education-illustration-01-raw-data@2x.png 2x,
              "
            />
            <p
              className={cx(CS.ml2, CS.textLeft)}
              style={textStyle}
            >{jt`When a raw data question ${(
              <strong>{t`returns any results`}</strong>
            )}`}</p>
          </div>
          <div
            className={cx(
              CS.relative,
              CS.flex,
              CS.alignCenter,
              CS.flexReverse,
              CS.pl4,
            )}
            style={{ marginTop: -50, marginRight: -80 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-02-goal.png"
              srcSet="
                app/assets/img/alerts/education-illustration-02-goal.png    1x,
                app/assets/img/alerts/education-illustration-02-goal@2x.png 2x,
              "
            />
            <p
              className={cx(CS.mr2, CS.textRight)}
              style={textStyle}
            >{jt`When a line or bar ${(
              <strong>{t`crosses a goal line`}</strong>
            )}`}</p>
          </div>
          <div
            className={cx(CS.relative, CS.flex, CS.alignCenter)}
            style={{ marginTop: -60, marginLeft: -55 }}
          >
            <img
              src="app/assets/img/alerts/education-illustration-03-progress.png"
              srcSet="
                app/assets/img/alerts/education-illustration-03-progress.png    1x,
                app/assets/img/alerts/education-illustration-03-progress@2x.png 2x,
              "
            />
            <p
              className={cx(CS.ml2, CS.textLeft)}
              style={textStyle}
            >{jt`When a progress bar ${(
              <strong>{t`reaches its goal`}</strong>
            )}`}</p>
          </div>
        </div>
        <Button
          primary
          className={CS.mt4}
          onClick={onProceed}
        >{t`Set up an alert`}</Button>
      </div>
    );
  }
}

class UpdateAlertModalContentInner extends Component {
  constructor(props) {
    super();
    this.state = {
      modifiedAlert: props.alert,
    };
  }

  onAlertChange = modifiedAlert => this.setState({ modifiedAlert });

  onUpdateAlert = async () => {
    const { question, updateAlert, updateUrl, onAlertUpdated } = this.props;
    const { modifiedAlert } = this.state;

    await updateAlert(modifiedAlert);
    await updateUrl(question, { dirty: false });
    onAlertUpdated();

    MetabaseAnalytics.trackStructEvent(
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
    const { onCancel, question, visualizationSettings, alert, user, isAdmin } =
      this.props;
    const { modifiedAlert } = this.state;

    const isCurrentUser = alert.creator.id === user.id;
    const title = isCurrentUser ? t`Edit your alert` : t`Edit alert`;
    const isValid = alertIsValid(alert);

    // TODO: Remove PulseEdit css hack
    return (
      <ModalContent onClose={onCancel} data-testid="alert-edit">
        <div
          className={cx(CS.mlAuto, CS.mrAuto, CS.mb4)}
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

          <AlertModalFooter>
            <Button onClick={onCancel} className={CS.mr2}>{t`Cancel`}</Button>
            <ButtonWithStatus
              titleForState={{ default: t`Save changes` }}
              disabled={!isValid}
              onClickOperation={this.onUpdateAlert}
            />
          </AlertModalFooter>
        </div>
      </ModalContent>
    );
  }
}

export const UpdateAlertModalContent = connect(
  state => ({
    user: getUser(state),
    isAdmin: getUserIsAdmin(state),
    question: getQuestion(state),
    visualizationSettings: getVisualizationSettings(state),
  }),
  { updateAlert, deleteAlert, updateUrl },
)(UpdateAlertModalContentInner);

export class DeleteAlertSection extends Component {
  getConfirmItems() {
    // same as in PulseEdit but with some changes to copy
    return this.props.alert.channels.map(c =>
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
      <DangerZone
        className={cx(
          AlertModalsS.AlertModalsBorder,
          CS.bordered,
          CS.mt4,
          CS.pt4,
          CS.mb2,
          CS.p3,
          CS.rounded,
          CS.relative,
        )}
      >
        <h3
          className={cx(CS.textError, CS.absolute, CS.top, CS.bgWhite, CS.px1)}
          style={{ marginTop: "-12px" }}
        >{jt`Danger Zone`}</h3>
        <div className={CS.ml1}>
          <h4 className={cx(CS.textBold, CS.mb1)}>{jt`Delete this alert`}</h4>
          <div className={CS.flex}>
            <p
              className={cx(CS.h4, CS.pr2)}
            >{jt`Stop delivery and delete this alert. There's no undo, so be careful.`}</p>
            <ModalWithTrigger
              ref={ref => (this.deleteModal = ref)}
              as={Button}
              triggerClasses={cx(
                ButtonsS.ButtonDanger,
                CS.flexAlignRight,
                CS.flexNoShrink,
                CS.alignSelfEnd,
              )}
              triggerElement={t`Delete this alert`}
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
      </DangerZone>
    );
  }
}

const AlertModalTitle = ({ text }) => (
  <div className={cx(CS.mlAuto, CS.mrAuto, CS.my4, CS.pb2, CS.textCentered)}>
    <img
      className={CS.mb3}
      src="app/assets/img/alerts/alert-bell-confetti-illustration.png"
      srcSet="
        app/assets/img/alerts/alert-bell-confetti-illustration.png    1x,
        app/assets/img/alerts/alert-bell-confetti-illustration@2x.png 2x
      "
    />
    <h1 className={CS.textDark}>{text}</h1>
  </div>
);

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
        trueText={isTimeseries ? t`Reaches the goal line` : t`Reaches the goal`}
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
  <div className={cx(CS.mb4, CS.pb2)}>
    <h3 className={cx(CS.textDark, CS.mb1)}>{title}</h3>
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

export function AlertEditSchedule({ alertType, schedule, onScheduleChange }) {
  return (
    <div>
      <h3 className={cx(CS.mt4, CS.mb3, CS.textDark)}>
        {t`How often should we check for results?`}
      </h3>

      <div className={cx(CS.bordered, CS.rounded, CS.mb2)}>
        {alertType === ALERT_TYPE_ROWS && <RawDataAlertTip />}
        <div className={cx(CS.p3, CS.bgLight)}>
          <SchedulePicker
            schedule={schedule}
            scheduleOptions={["hourly", "daily", "weekly"]}
            onScheduleChange={onScheduleChange}
            textBeforeInterval={t`Check`}
          />
        </div>
      </div>
    </div>
  );
}

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

function RawDataAlertTipInner(props) {
  const display = props.question.display();
  const vizSettings = props.visualizationSettings;
  const goalEnabled = vizSettings["graph.show_goal"];
  const isLineAreaBar =
    display === "line" || display === "area" || display === "bar";
  const isMultiSeries =
    isLineAreaBar &&
    vizSettings["graph.metrics"] &&
    vizSettings["graph.metrics"].length > 1;
  const showMultiSeriesGoalAlert = goalEnabled && isMultiSeries;

  return (
    <div
      className={cx(
        AlertModalsS.AlertModalsBorder,
        CS.borderRowDivider,
        CS.p3,
        CS.flex,
        CS.alignCenter,
      )}
    >
      <div
        className={cx(
          AlertModalsS.AlertModalsBorder,
          CS.flex,
          CS.alignCenter,
          CS.justifyCenter,
          CS.p2,
          CS.mr2,
          CS.textMedium,
          CS.circle,
          CS.bgLight,
        )}
      >
        <Icon name="lightbulb" size="20" />
      </div>
      {showMultiSeriesGoalAlert ? <MultiSeriesAlertTip /> : <NormalAlertTip />}
    </div>
  );
}

export const RawDataAlertTip = connect(state => ({
  question: getQuestion(state),
  visualizationSettings: getVisualizationSettings(state),
}))(RawDataAlertTipInner);

export const MultiSeriesAlertTip = () => (
  <div>{jt`${(
    <strong>{t`Heads up`}:</strong>
  )} Goal-based alerts aren't yet supported for charts with more than one line, so this alert will be sent whenever the chart has ${(
    <em>{t`results`}</em>
  )}.`}</div>
);
export const NormalAlertTip = () => (
  <div>{jt`${(
    <strong key="alert-tip">{t`Tip`}:</strong>
  )} This kind of alert is most useful when your saved question doesn’t ${(
    <em key="alert-tip-em">{t`usually`}</em>
  )} return any results, but you want to know when it does.`}</div>
);
