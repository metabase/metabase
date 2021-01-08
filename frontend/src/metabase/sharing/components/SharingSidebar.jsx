import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t, jt, ngettext, msgid } from "ttag";
import { Flex } from "grid-styled";

import Card from "metabase/components/Card";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import EmailAttachmentPicker from "metabase/sharing/components/EmailAttachmentPicker";
import ExternalLink from "metabase/components/ExternalLink";
import Icon from "metabase/components/Icon";
import Label from "metabase/components/type/Label";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";
import Link from "metabase/components/Link";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import RecipientPicker from "metabase/pulse/components/RecipientPicker";
import SchedulePicker from "metabase/components/SchedulePicker";
import Select, { Option } from "metabase/components/Select";
import SendTestEmail from "metabase/components/SendTestEmail";
import Sidebar from "metabase/dashboard/components/Sidebar";
import Toggle from "metabase/components/Toggle";
import Tooltip from "metabase/components/Tooltip";

import Collections from "metabase/entities/collections";
import Pulses from "metabase/entities/pulses";
import User from "metabase/entities/users";

import { push, goBack } from "react-router-redux";
import { connect } from "react-redux";

import { cleanPulse, createChannel, pulseIsValid } from "metabase/lib/pulse";
import MetabaseSettings from "metabase/lib/settings";

import {
  getPulseId,
  getEditingPulse,
  getPulseCardPreviews,
  getPulseFormInput,
  getPulseList,
} from "metabase/pulse/selectors";

import { getUser } from "metabase/selectors/user";

import {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  testPulse,
  fetchPulsesByDashboardId,
} from "metabase/pulse/actions";

import cx from "classnames";

export const CHANNEL_ICONS = {
  email: "mail",
  slack: "slack",
};

const CHANNEL_NOUN_PLURAL = {
  email: t`Emails`,
  slack: t`Slack messages`,
};

const Heading = ({ children }) => <h4>{children}</h4>;

const cardsFromDashboard = dashboard => {
  if (dashboard === undefined) {
    return [];
  }

  return dashboard.ordered_cards.map(card => ({
    id: card.card.id,
    collection_id: card.card.collection_id,
    description: card.card.description,
    display: card.card.display,
    name: card.card.name,
    include_csv: false,
    include_xls: false,
    dashboard_card_id: card.id,
    dashboard_id: dashboard.id,
    parameter_mappings: [], // card.parameter_mappings, //TODO: this ended up as "[]" ?
  }));
};

const nonTextCardsFromDashboard = dashboard => {
  return cardsFromDashboard(dashboard).filter(card => card.display !== "text");
};

const cardsToPulseCards = (cards, pulseCards) => {
  return cards.map(card => {
    const pulseCard = pulseCards.find(pc => pc.id === card.id) || card;
    return {
      ...card,
      include_csv: pulseCard.include_csv,
      include_xls: pulseCard.include_xls,
    };
  });
};

const getEditingPulseWithDefaults = (state, props) => {
  const pulse = getEditingPulse(state, props);
  const dashboardWrapper = state.dashboard;
  if (!pulse.name) {
    pulse.name = dashboardWrapper.dashboards[dashboardWrapper.dashboardId].name;
  }
  pulse.cards = cardsToPulseCards(
    nonTextCardsFromDashboard(props.dashboard),
    pulse.cards,
  );

  return pulse;
};

const mapStateToProps = (state, props) => ({
  pulseId: getPulseId(state, props),
  pulse: getEditingPulseWithDefaults(state, props),
  cardPreviews: getPulseCardPreviews(state, props),
  formInput: getPulseFormInput(state, props),
  user: getUser(state),
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
  pulseList: getPulseList(state, props),
});

const mapDispatchToProps = {
  setEditingPulse,
  updateEditingPulse,
  saveEditingPulse,
  fetchPulseFormInput,
  fetchPulseCardPreview,
  setPulseArchived: Pulses.actions.setArchived,
  testPulse,
  onChangeLocation: push,
  goBack,
  fetchPulsesByDashboardId,
};

@User.loadList()
@connect(
  mapStateToProps,
  mapDispatchToProps,
)
class SharingSidebar extends React.Component {
  state = {
    editingMode: undefined,
    // use this to know where to go "back" to
    returnMode: undefined,
  };

  static propTypes = {
    dashboard: PropTypes.object.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    fetchPulsesByDashboardId: PropTypes.func.isRequired,
    formInput: PropTypes.object.isRequired,
    goBack: PropTypes.func,
    initialCollectionId: PropTypes.number,
    onChangeLocation: PropTypes.func.isRequired,
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    pulseList: PropTypes.array.isRequired,
    saveEditingPulse: PropTypes.func.isRequired,
    setEditingPulse: PropTypes.func.isRequired,
    testPulse: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
  };

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  addChannel(type) {
    const { dashboard, pulse, formInput } = this.props;

    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    const newPulse = {
      ...pulse,
      channels: pulse.channels.concat(channel),
      cards: nonTextCardsFromDashboard(dashboard),
    };
    this.setPulse(newPulse);
  }

  componentDidMount() {
    //TODO: if these don't finish before we render, we render the wrong thing. help?
    this.props.fetchPulseFormInput();
    this.props.fetchPulsesByDashboardId(this.props.dashboard.id);

    this.props.setEditingPulse(
      this.props.pulseId,
      this.props.initialCollectionId,
    );
  }

  componentDidUpdate() {
    const { pulseList } = this.props;
    const { editingMode } = this.state;

    if (editingMode === undefined) {
      if (pulseList && pulseList.length > 0) {
        this.setState({ editingMode: "list-pulses" });
      } else {
        this.createSubscription();
      }
    }
  }

  onChannelPropertyChange(index, name, value) {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], [name]: value };

    this.setPulse({ ...pulse, channels });
  }

  // changedProp contains the schedule property that user just changed
  // newSchedule may contain also other changed properties as some property changes reset other properties
  onChannelScheduleChange(index, newSchedule, changedProp) {
    const { pulse } = this.props;
    const channels = [...pulse.channels];

    channels[index] = { ...channels[index], ...newSchedule };
    this.setPulse({ ...pulse, channels });
  }

  renderFields(channel, index, channelSpec) {
    const valueForField = field => {
      const value = channel.details && channel.details[field.name];
      return value != null ? value : null; // convert undefined to null so Uncontrollable doesn't ignore changes
    };
    return (
      <div>
        {channelSpec.fields.map(field => (
          <div key={field.name} className={field.name}>
            <span className="text-bold mr1">{field.displayName}</span>
            {field.type === "select" ? (
              <Select
                className="text-bold bg-white inline-block"
                value={valueForField(field)}
                placeholder={t`Pick a user or channel...`}
                searchProp="name"
                // Address #5799 where `details` object is missing for some reason
                onChange={o =>
                  this.onChannelPropertyChange(index, "details", {
                    ...channel.details,
                    [field.name]: o.target.value,
                  })
                }
              >
                {field.options.map(option => (
                  <Option name={option} value={option}>
                    {option}
                  </Option>
                ))}
              </Select>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

  toggleSkipIfEmpty = () => {
    const { pulse } = this.props;
    this.setPulse({ ...pulse, skip_if_empty: !pulse.skip_if_empty });
  };

  handleSave = async () => {
    const { pulse, dashboard, formInput } = this.props;

    const cleanedPulse = cleanPulse(pulse, formInput.channels);
    cleanedPulse.name = dashboard.name;
    await this.props.updateEditingPulse(cleanedPulse);

    await this.props.saveEditingPulse();

    await this.props.fetchPulsesByDashboardId(dashboard.id);
    this.setState({ editingMode: "list-pulses" });
  };

  createSubscription = () => {
    this.setState({
      editingMode: "new-pulse",
      returnMode: this.state.editingMode,
    });
    this.props.setEditingPulse(null, null);
  };

  editPulse = (pulse, channelType) => {
    this.setPulse(pulse);
    this.setState({
      editingMode: "add-edit-" + channelType,
      returnMode: this.state.editingMode,
    });
  };

  formatHourAMPM(hour) {
    if (hour > 12) {
      const newHour = hour - 12;
      return t`${newHour}:00 PM`;
    } else if (hour === 0) {
      return t`12:00 AM`;
    } else {
      return t`${hour}:00 AM`;
    }
  }

  formatDay(day) {
    switch (day) {
      case "mon":
        return t`Monday`;
      case "tue":
        return t`Tuesday`;
      case "wed":
        return t`Wednesday`;
      case "thu":
        return t`Thursday`;
      case "fri":
        return t`Friday`;
      case "sat":
        return t`Saturday`;
      case "sun":
        return t`Sunday`;
      default:
        return day;
    }
  }

  formatFrame(frame) {
    switch (frame) {
      case "first":
        return t`first`;
      case "last":
        return t`last`;
      case "mid":
        return t`15th (Midpoint)`;
      default:
        return frame;
    }
  }

  friendlySchedule(channel) {
    let scheduleString = "";
    if (channel.channel_type === "email") {
      scheduleString += t`Emailed `;
    } else if (channel.channel_type === "slack") {
      scheduleString += t`Sent to ` + channel.details.channel + " ";
    } else {
      scheduleString += t`Sent `;
    }

    switch (channel.schedule_type) {
      case "hourly":
        scheduleString += t`hourly`;
        break;
      case "daily": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        scheduleString += t`daily at ${ampm}`;
        break;
      }
      case "weekly": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        const day = this.formatDay(channel.schedule_day);
        scheduleString += t`${day} at ${ampm}`;
        break;
      }
      case "monthly": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        const day = this.formatDay(channel.schedule_day);
        const frame = this.formatFrame(channel.schedule_frame);
        scheduleString += t`monthly on the ${frame} ${day} at ${ampm}`;
        break;
      }
      default:
        scheduleString += channel.schedule_type;
    }

    return scheduleString;
  }

  renderEmailRecipients(recipients) {
    const [first, ...rest] = recipients;

    let text = "";

    if (rest != null && rest.length > 0) {
      text += ngettext(
        msgid` and ${rest.length} other`,
        ` and ${rest.length} others`,
        rest.length,
      );
    }

    return (
      <li className="flex align-center mr1 text-bold text-medium hover-child hover--inherit">
        <Icon
          name="group"
          className="text-medium hover-child hover--inherit"
          size={12}
        />
        <span
          className="ml1 text-medium hover-child hover--inherit"
          style={{ fontSize: "12px" }}
        >
          {first.common_name || first.email}
          {text !== "" && text}
        </span>
      </li>
    );
  }

  renderRecipients(pulse) {
    return (
      <div className="text-medium hover-child">
        <ul
          className="flex flex-wrap scroll-x scroll-y"
          style={{ maxHeight: 130 }}
        >
          {this.renderEmailRecipients(pulse.channels[0].recipients)}
        </ul>
      </div>
    );
  }

  getConfirmItems() {
    return this.props.pulse.channels.map((c, index) =>
      c.channel_type === "email" ? (
        <span key={index}>
          {jt`This dashboard will no longer be emailed to ${(
            <strong>
              {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
                c.recipients.length,
              )}
            </strong>
          )} ${<strong>{c.schedule_type}</strong>}`}
          .
        </span>
      ) : c.channel_type === "slack" ? (
        <span key={index}>
          {jt`Slack channel ${(
            <strong>{c.details && c.details.channel}</strong>
          )} will no longer get this dashboard ${(
            <strong>{c.schedule_type}</strong>
          )}`}
          .
        </span>
      ) : (
        <span key={index}>
          {jt`Channel ${(
            <strong>{c.channel_type}</strong>
          )} will no longer receive this dashboard ${(
            <strong>{c.schedule_type}</strong>
          )}`}
          .
        </span>
      ),
    );
  }

  renderDeleteSubscription() {
    const { pulse } = this.props;

    if (pulse.id != null && !pulse.archived) {
      return (
        <div className="border-top pt1 pb3 flex justify-end">
          <ModalWithTrigger
            triggerClasses="Button Button--borderless text-light text-error-hover flex-align-right flex-no-shrink"
            triggerElement={t`Delete this subscription`}
          >
            {({ onClose }) => (
              <DeleteModalWithConfirm
                objectType="pulse"
                title={t`Delete this subscription to ${pulse.name}?`}
                buttonText={t`Delete`}
                confirmItems={this.getConfirmItems()}
                onClose={onClose}
                onDelete={this.handleArchive}
              />
            )}
          </ModalWithTrigger>
        </div>
      );
    }

    return null;
  }

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);
    await this.props.fetchPulsesByDashboardId(this.props.dashboard.id);
    this.setState({ editingMode: undefined });
  };

  // Because you can navigate down the sidebar, we need to wrap
  // onCancel from props and either call that or reset back a screen
  onCancel = () => {
    const { onCancel } = this.props;
    if (this.state.returnMode) {
      // set the current mode back to what it should be
      this.setState({
        editingMode: this.state.returnMode,
        returnMode: undefined,
      });
    } else {
      onCancel();
    }
  };

  render() {
    const { editingMode } = this.state;
    const { pulse, formInput, pulseList } = this.props;

    const caveatMessage = (
      <Text className="mx4 my2 p2 bg-light text-dark rounded">{jt`${(
        <span className="text-bold">Note:</span>
      )} charts in your subscription won't look the same as in your dashboard. ${(
        <ExternalLink
          className="link"
          target="_blank"
          href={MetabaseSettings.docsUrl("users-guide/10-pulses")}
        >
          Learn more
        </ExternalLink>
      )}.`}</Text>
    );

    // protect from empty values that will mess this up
    if (formInput === null || pulse === null || pulseList === null) {
      return <Sidebar />;
    }

    if (editingMode === "list-pulses") {
      return (
        <Sidebar>
          <div className="px4 pt3 flex justify-between align-center">
            <Subhead>{t`Subscriptions`}</Subhead>

            <Flex align="center">
              <Tooltip tooltip={t`Set up a new schedule`}>
                <Icon
                  name="add"
                  className="text-brand bg-light-hover rounded p1 cursor-pointer mr1"
                  size={18}
                  onClick={() => this.createSubscription()}
                />
              </Tooltip>
              <Tooltip tooltip={t`Close`}>
                <Icon
                  name="close"
                  className="text-light bg-light-hover rounded p1 cursor-pointer"
                  size={22}
                  onClick={this.onCancel}
                />
              </Tooltip>
            </Flex>
          </div>
          <div className="my2 mx4">
            {pulseList.map(pulse => (
              <Card
                flat
                className="mb3 cursor-pointer bg-brand-hover"
                onClick={() =>
                  this.editPulse(pulse, pulse.channels[0].channel_type)
                }
              >
                <div className="px3 py2 hover-parent hover--inherit text-white-hover">
                  <div className="flex align-center hover-child hover--inherit">
                    <Icon
                      name={
                        pulse.channels[0].channel_type === "email"
                          ? "mail"
                          : "slack"
                      }
                      className="mr1"
                      style={{ paddingBottom: "5px" }}
                      size={16}
                    />
                    <Label className="hover-child hover--inherit">
                      {this.friendlySchedule(pulse.channels[0])}
                    </Label>
                  </div>
                  {pulse.channels[0].channel_type === "email" &&
                    this.renderRecipients(pulse)}
                </div>
              </Card>
            ))}
          </div>
        </Sidebar>
      );
    }

    if (editingMode === "new-pulse") {
      const emailSpec = formInput.channels.email;
      const slackSpec = formInput.channels.slack;

      return (
        <Sidebar onCancel={this.onCancel}>
          <div className="mt2 pt2 px4">
            <Heading>{t`Create a dashboard subscription`}</Heading>
          </div>
          <div className="my1 mx4">
            <Card
              flat
              className={cx("mt1 mb3", {
                "cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit":
                  emailSpec.configured,
              })}
              onClick={() => {
                if (emailSpec.configured) {
                  this.setState({
                    editingMode: "add-edit-email",
                    returnMode: this.state.editingMode,
                  });
                  this.addChannel("email");
                }
              }}
            >
              <div className="px3 pt3 pb2">
                <div className="flex align-center">
                  <Icon
                    name="mail"
                    className={cx(
                      "mr1",
                      {
                        "text-brand hover-child hover--inherit":
                          emailSpec.configured,
                      },
                      { "text-light": !emailSpec.configured },
                    )}
                  />
                  <h3
                    className={cx({ "text-light": !emailSpec.configured })}
                  >{t`Email it`}</h3>
                </div>
                <Text
                  lineHeight={1.5}
                  className={cx("text-medium", {
                    "hover-child hover--inherit": emailSpec.configured,
                  })}
                >
                  {!emailSpec.configured &&
                    jt`You'll need to ${(
                      <Link to="/admin/settings/email" className="link">
                        set up email
                      </Link>
                    )} first.`}
                  {emailSpec.configured &&
                    t`You can send this dashboard regularly to users or email addresses.`}
                </Text>
              </div>
            </Card>
            <Card
              flat
              className={cx({
                "cursor-pointer text-white-hover bg-brand-hover hover-parent hover--inherit":
                  slackSpec.configured,
              })}
              onClick={() => {
                if (slackSpec.configured) {
                  this.setState({
                    editingMode: "add-edit-slack",
                    returnMode: this.state.editingMode,
                  });
                  this.addChannel("slack");
                }
              }}
            >
              <div className="px3 pt3 pb2">
                <div className="flex align-center mb1">
                  <Icon
                    name={slackSpec.configured ? "slack_colorized" : "slack"}
                    size={24}
                    className={cx("mr1", {
                      "text-light": !slackSpec.configured,
                      "hover-child hover--inherit": slackSpec.configured,
                    })}
                  />
                  <h3
                    className={cx({ "text-light": !slackSpec.configured })}
                  >{t`Send it to Slack`}</h3>
                </div>
                <Text
                  lineHeight={1.5}
                  className={cx("text-medium", {
                    "hover-child hover--inherit": slackSpec.configured,
                  })}
                >
                  {!slackSpec.configured &&
                    jt`First, you'll have to ${(
                      <Link to="/admin/settings/slack" className="link">
                        configure Slack
                      </Link>
                    )}.`}
                  {slackSpec.configured &&
                    t`Pick a channel and a schedule, and Metabase will do the rest.`}
                </Text>
              </div>
            </Card>
          </div>
        </Sidebar>
      );
    }

    if (
      editingMode === "add-edit-email" &&
      (pulse.channels && pulse.channels.length > 0)
    ) {
      const channelType = "email";

      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === channelType);
      // protection from a failure where the channels aren't loaded yet
      if (channelDetails.length === 0) {
        return <Sidebar />;
      }

      const channel = channelDetails[0][0];
      const index = channelDetails[0][1];

      const channelSpec = formInput.channels.email;

      return (
        <Sidebar
          onClose={this.handleSave}
          onCancel={this.onCancel}
          className="text-dark"
          closeIsDisabled={!pulseIsValid(pulse, formInput.channels)}
        >
          <div className="pt4 px4 flex align-center">
            <Icon name="mail" className="mr1" size={21} />
            <Heading>{t`Email this dashboard`}</Heading>
          </div>
          {caveatMessage}
          <div className="my2 px4">
            <div>
              <div className="text-bold mb1">
                {this.props.emailRecipientText || t`To:`}
              </div>
              <RecipientPicker
                isNewPulse={this.props.pulseId === undefined}
                autoFocus={false}
                recipients={channel.recipients}
                recipientTypes={channelSpec.recipients}
                users={this.props.users}
                onRecipientsChange={recipients =>
                  this.onChannelPropertyChange(index, "recipients", recipients)
                }
              />
            </div>
            {channelSpec.fields &&
              this.renderFields(channel, index, channelSpec)}
            <SchedulePicker
              schedule={_.pick(
                channel,
                "schedule_day",
                "schedule_frame",
                "schedule_hour",
                "schedule_type",
              )}
              scheduleOptions={channelSpec.schedules}
              textBeforeInterval={t`Sent`}
              textBeforeSendTime={t`${CHANNEL_NOUN_PLURAL[
                channelSpec && channelSpec.type
              ] || t`Messages`} will be sent at`}
              onScheduleChange={this.onChannelScheduleChange.bind(this, index)}
            />
            <div className="pt2 pb1">
              <SendTestEmail
                channel={channel}
                pulse={pulse}
                testPulse={this.props.testPulse}
              />
            </div>

            <div className="text-bold py3 mt2 flex justify-between align-center border-top">
              <Heading>{t`Don't send if there aren't results`}</Heading>
              <Toggle
                value={pulse.skip_if_empty || false}
                onChange={this.toggleSkipIfEmpty}
              />
            </div>
            <div className="text-bold py2 flex justify-between align-center border-top">
              <div className="flex align-center">
                <Heading>{t`Attach results`}</Heading>
                <Icon
                  name="info"
                  className="text-medium ml1"
                  size={12}
                  tooltip={t`Attachments can contain up to 2,000 rows of data.`}
                />
              </div>
            </div>
            <EmailAttachmentPicker
              cards={pulse.cards}
              pulse={pulse}
              setPulse={this.setPulse.bind(this)}
            />
            {pulse.id != null && this.renderDeleteSubscription()}
          </div>
        </Sidebar>
      );
    }

    if (
      editingMode === "add-edit-slack" &&
      (pulse.channels && pulse.channels.length > 0)
    ) {
      const channelType = "slack";

      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === channelType);
      // protection from a failure where the channels aren't loaded yet
      if (channelDetails.length === 0) {
        return <Sidebar />;
      }

      const channel = channelDetails[0][0];
      const index = channelDetails[0][1];

      const channelSpec = formInput.channels.slack;

      return (
        <Sidebar
          onClose={this.handleSave}
          onCancel={this.onCancel}
          className="text-dark"
        >
          <div className="pt4 flex align-center px4 mb3">
            <Icon name="slack" className="mr1" size={21} />
            <Heading>{t`Send this dashboard to Slack`}</Heading>
          </div>
          {caveatMessage}
          <div className="pb2 px4">
            {channelSpec.fields &&
              this.renderFields(channel, index, channelSpec)}
            <SchedulePicker
              schedule={_.pick(
                channel,
                "schedule_day",
                "schedule_frame",
                "schedule_hour",
                "schedule_type",
              )}
              scheduleOptions={channelSpec.schedules}
              textBeforeInterval={t`Sent`}
              textBeforeSendTime={t`${CHANNEL_NOUN_PLURAL[
                channelSpec && channelSpec.type
              ] || t`Messages`} will be sent at`}
              onScheduleChange={this.onChannelScheduleChange.bind(this, index)}
            />
            <div className="text-bold py2 mt2 flex justify-between align-center border-top">
              <Heading>{t`Don't send if there aren't results`}</Heading>
              <Toggle
                value={pulse.skip_if_empty || false}
                onChange={this.toggleSkipIfEmpty}
              />
            </div>
            {pulse.id != null && this.renderDeleteSubscription()}
          </div>
        </Sidebar>
      );
    }

    return <Sidebar />;
  }
}

export default SharingSidebar;
