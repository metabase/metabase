import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import { t, jt, ngettext, msgid } from "ttag";

import Card from "metabase/components/Card";
import Icon from "metabase/components/Icon";
import Radio from "metabase/components/Radio";
import Select, { Option } from "metabase/components/Select";
import Collections from "metabase/entities/collections";
import Toggle from "metabase/components/Toggle";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";

import RecipientPicker from "metabase/pulse/components/RecipientPicker";

import SchedulePicker from "metabase/components/SchedulePicker";

import Sidebar from "metabase/dashboard/components/Sidebar";

import Pulses from "metabase/entities/pulses";
import User from "metabase/entities/users";

import { push, goBack } from "react-router-redux";
import { connect } from "react-redux";

import { cleanPulse, createChannel } from "metabase/lib/pulse";

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

const mapStateToProps = (state, props) => ({
  pulseId: getPulseId(state, props),
  pulse: getEditingPulse(state, props),
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
    editingMode: "unknown",
  };

  static propTypes = {
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    dashboard: PropTypes.object.isRequired,
    formInput: PropTypes.object.isRequired,
    setEditingPulse: PropTypes.func.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
    saveEditingPulse: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    goBack: PropTypes.func,
    fetchPulsesByDashboardId: PropTypes.func.isRequired,
    pulseList: PropTypes.array.isRequired,
    initialCollectionId: PropTypes.number,
  };

  constructor(props) {
    super(props);
  }

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  addChannel(type) {
    const { pulse, formInput } = this.props;

    const channelSpec = formInput.channels[type];
    if (!channelSpec) {
      return;
    }

    const channel = createChannel(channelSpec);

    const newPulse = {
      ...pulse,
      channels: pulse.channels.concat(channel),
      cards: this.cardsFromDashboard(),
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

    if ("unknown" === editingMode) {
      if (pulseList && pulseList.length > 0) {
        this.setState({ editingMode: "list-pulses" });
      } else {
        this.setState({ editingMode: "new-pulse" });
      }
    }
  }

  cardsFromDashboard() {
    const { dashboard } = this.props;

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

  toggleAttach = value => {
    if (value) {
      // if any are set, use that value, otherwise use "csv", our default
      const existingValue = this.attachmentTypeValue();
      this.setAttachmentType(existingValue || "csv");
    } else {
      this.setAttachmentType(null);
    }
  };

  setAttachmentType(value) {
    const { pulse } = this.props;

    const newPulse = {
      ...pulse,
      cards: pulse.cards.map(card => {
        if (value === null) {
          card.include_xls = false;
          card.include_csv = false;
        } else if (value === "xls") {
          card.include_xls = true;
          card.include_csv = false;
        } else if (value === "csv") {
          card.include_xls = false;
          card.include_csv = true;
        }
        return card;
      }),
    };
    this.setPulse(newPulse);
  }

  attachmentTypeValue() {
    const { pulse } = this.props;

    if (pulse.cards.some(c => c.include_xls)) {
      return "xls";
    } else if (pulse.cards.some(c => c.include_csv)) {
      return "csv";
    } else {
      return null;
    }
  }

  handleSave = async () => {
    const { pulse, dashboard, formInput } = this.props;

    const cleanedPulse = cleanPulse(pulse, formInput.channels);
    cleanedPulse.name = dashboard.name;
    await this.props.updateEditingPulse(cleanedPulse);

    console.log("cleanedPulse", cleanedPulse);

    await this.props.saveEditingPulse();

    await this.props.fetchPulsesByDashboardId(dashboard.id);
    this.setState({ editingMode: "list-pulses" });
  };

  createSubscription = () => {
    this.setState({ editingMode: "new-pulse" });
    this.props.setEditingPulse(null, null);
  };

  editPulse = (pulse, channelType) => {
    this.setPulse(pulse);
    this.setState({ editingMode: "add-edit-" + channelType });
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
        return t`First`;
      case "last":
        return t`Last`;
      case "mid":
        return t`15th (Midpoint)`;
      default:
        return frame;
    }
  }

  friendlySchedule(channel) {
    let scheduleString = "";

    switch (channel.schedule_type) {
      case "hourly":
        scheduleString += t`Hourly`;
        break;
      case "daily": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        scheduleString += t`Daily at ${ampm}`;
        break;
      }
      case "weekly": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        const day = this.formatDay(channel.schedule_day);
        scheduleString += t`Weekly at ${ampm} on ${day}`;
        break;
      }
      case "monthly": {
        const ampm = this.formatHourAMPM(channel.schedule_hour);
        const day = this.formatDay(channel.schedule_day);
        const frame = this.formatFrame(channel.schedule_frame);
        scheduleString += t`Monthly on the ${frame} ${day} at ${ampm}`;
        break;
      }
      default:
        scheduleString += channel.schedule_type;
    }

    return scheduleString;
  }

  renderEmail(recipient) {
    return (
      <div className="flex align-center">
        <span className="text-white">
          <Icon name="person" />
        </span>
        <span className="ml1">{recipient.common_name || recipient.email}</span>
      </div>
    );
  }

  renderEmailRecipients(recipients) {
    return recipients.map(recipient => (
      <li className={cx("flex align-center mr1 mb1 p1 rounded bg-medium")}>
        {this.renderEmail(recipient)}
      </li>
    ));
  }

  renderSlackDetails(details) {
    return (
      <li className={cx("flex align-center mr1 mb1 p1 rounded bg-medium")}>
        {details.channel}
      </li>
    );
  }

  renderRecipients(pulse) {
    return (
      <div className="text-medium">
        <ul
          className={cx(
            "pl1 pt1 pb0 pr0 flex flex-wrap bg-white scroll-x scroll-y",
          )}
          style={{ maxHeight: 130 }}
        >
          {pulse.channels[0].channel_type === "email" &&
            this.renderEmailRecipients(pulse.channels[0].recipients)}
          {pulse.channels[0].channel_type === "slack" &&
            this.renderSlackDetails(pulse.channels[0].details)}
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
        <ModalWithTrigger
          triggerClasses="Button Button--danger flex-align-right flex-no-shrink"
          triggerElement={t`Delete this subscription`}
        >
          {({ onClose }) => (
            <DeleteModalWithConfirm
              objectType="pulse"
              title={t`Archive` + ' "' + pulse.name + '"?'}
              buttonText={t`Archive`}
              confirmItems={this.getConfirmItems()}
              onClose={onClose}
              onDelete={this.handleArchive}
            />
          )}
        </ModalWithTrigger>
      );
    }

    return null;
  }

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);
    await this.props.fetchPulsesByDashboardId(this.props.dashboard.id);
    this.setState({ editingMode: "unknown" });
  };

  render() {
    const { editingMode } = this.state;
    const { pulse, formInput, pulseList } = this.props;

    if (editingMode === "list-pulses") {
      return (
        <Sidebar>
          <div className="p4 flex justify-between align-center">
            <h3>{t`Subscriptions`}</h3>

            <Icon
              name="add"
              className="text-brand bg-light-hover rounded p1 cursor-pointer"
              size={20}
              onClick={() => this.createSubscription()}
            />
          </div>
          <div className="myb mx4">
            {pulseList.map(pulse => (
              <Card
                flat
                hoverable
                className="mt1 mb3 cursor-pointer"
                onClick={() =>
                  this.editPulse(pulse, pulse.channels[0].channel_type)
                }
              >
                <div className="p3">
                  <div className="flex align-center mb1">
                    <Icon
                      name={
                        pulse.channels[0].channel_type === "email"
                          ? "mail"
                          : "slack"
                      }
                      className="mr1 text-brand"
                    />
                    <h3>{this.friendlySchedule(pulse.channels[0])}</h3>
                  </div>
                  {this.renderRecipients(pulse)}
                </div>
              </Card>
            ))}
          </div>
        </Sidebar>
      );
    }

    if (editingMode === "new-pulse") {
      return (
        <Sidebar onCancel={() => true}>
          <div className="mt2 pt2 px4">
            <Heading>{t`Create a dashboard subscription`}</Heading>
          </div>
          <div className="my1 mx4">
            <Card
              flat
              hoverable
              className="mt1 mb3 cursor-pointer"
              onClick={() => {
                this.setState({ editingMode: "add-edit-email" });
                this.addChannel("email");
              }}
            >
              <div className="p3">
                <div className="flex align-center mb1">
                  <Icon name="mail" className="mr1 text-brand" />
                  <h3>{t`Email it`}</h3>
                </div>
                <div className="text-medium">
                  {t`You can send this dashboard regularly to users or email addresses.`}
                </div>
              </div>
            </Card>
            <Card
              flat
              hoverable
              className="cursor-pointer"
              onClick={() => {
                this.setState({ editingMode: "add-edit-slack" });
                this.addChannel("slack");
              }}
            >
              <div className="p3">
                <div className="flex align-center mb1">
                  <Icon name="slack" size={24} className="mr1" />
                  <h3>{t`Send it to Slack`}</h3>
                </div>
                <div className="text-medium">
                  {t`Pick a channel and a schedule, and Metabase will do the rest.`}
                </div>
              </div>
            </Card>
          </div>
        </Sidebar>
      );
    }

    if (editingMode === "add-edit-email") {
      const channelType = "email";

      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === channelType);
      const channel = channelDetails[0][0];
      const index = channelDetails[0][1];

      const channelSpec = formInput.channels.email;

      return (
        <Sidebar
          onClose={this.handleSave}
          onCancel={() => true}
          className="text-dark"
        >
          <div className="pt4 flex align-center px4">
            <Icon name="mail" className="mr1" size={21} />
            <Heading>{t`Email this dashboard`}</Heading>
          </div>
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
            <div className="text-bold py2 mt2 flex justify-between align-center border-top">
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
              <Toggle
                value={this.attachmentTypeValue() != null}
                onChange={this.toggleAttach}
              />
            </div>
            {this.attachmentTypeValue() != null && (
              <div className="text-bold py2 flex justify-between align-center">
                <Radio
                  options={[
                    { name: "CSV", value: "csv" },
                    { name: "XLSX", value: "xls" },
                  ]}
                  onChange={value => this.setAttachmentType(value)}
                  value={this.attachmentTypeValue()}
                />
              </div>
            )}
            {pulse.id != null && this.renderDeleteSubscription()}
          </div>
        </Sidebar>
      );
    }

    if (editingMode === "add-edit-slack") {
      const channelType = "slack";

      const channelDetails = pulse.channels
        .map((c, i) => [c, i])
        .filter(([c, i]) => c.enabled && c.channel_type === channelType);
      const channel = channelDetails[0][0];
      const index = channelDetails[0][1];

      const channelSpec = formInput.channels.slack;

      return (
        <Sidebar
          onClose={this.handleSave}
          onCancel={() => true}
          className="text-dark"
        >
          <div className="pt4 flex align-center px4 mb3">
            <Icon name="slack" className="mr1" size={21} />
            <Heading>{t`Send this dashboard to Slack`}</Heading>
          </div>
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
