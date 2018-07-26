/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t, jt, ngettext, msgid } from "c-3po";
import { withRouter } from "react-router";

import PulseEditName from "./PulseEditName.jsx";
import PulseEditCollection from "./PulseEditCollection";
import PulseEditCards from "./PulseEditCards.jsx";
import PulseEditChannels from "./PulseEditChannels.jsx";
import PulseEditSkip from "./PulseEditSkip.jsx";
import WhatsAPulse from "./WhatsAPulse.jsx";

import ActionButton from "metabase/components/ActionButton.jsx";
import Button from "metabase/components/Button";
import MetabaseAnalytics from "metabase/lib/analytics";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm.jsx";

import { pulseIsValid, cleanPulse, emailIsEnabled } from "metabase/lib/pulse";
import * as Urls from "metabase/lib/urls";

import cx from "classnames";
import { connect } from "react-redux";
import { goBack } from "react-router-redux";

import Collections from "metabase/entities/collections";
import Pulses from "metabase/entities/pulses";

const mapStateToProps = (state, props) => ({
  initialCollectionId: Collections.selectors.getInitialCollectionId(
    state,
    props,
  ),
});

const mapDispatchToProps = {
  setPulseArchived: Pulses.actions.setArchived,
  goBack,
};

@connect(mapStateToProps, mapDispatchToProps)
@withRouter
export default class PulseEdit extends Component {
  static propTypes = {
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    formInput: PropTypes.object.isRequired,
    setEditingPulse: PropTypes.func.isRequired,
    fetchCards: PropTypes.func.isRequired,
    fetchUsers: PropTypes.func.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
    saveEditingPulse: PropTypes.func.isRequired,
    deletePulse: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    goBack: PropTypes.func,
    initialCollectionId: PropTypes.number,
  };

  componentDidMount() {
    this.props.setEditingPulse(
      this.props.pulseId,
      this.props.initialCollectionId,
    );
    this.props.fetchCards();
    this.props.fetchUsers();
    this.props.fetchPulseFormInput();

    MetabaseAnalytics.trackEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Start",
    );
  }

  handleSave = async () => {
    let pulse = cleanPulse(this.props.pulse, this.props.formInput.channels);
    await this.props.updateEditingPulse(pulse);
    await this.props.saveEditingPulse();

    MetabaseAnalytics.trackEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Complete",
      this.props.pulse.cards.length,
    );

    this.props.onChangeLocation(Urls.collection(pulse.collection_id));
  };

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);

    MetabaseAnalytics.trackEvent("PulseArchive", "Complete");

    this.props.onChangeLocation(
      Urls.collection(this.props.pulse.collection_id),
    );
  };

  handleUnarchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, false);
    this.setPulse({ ...this.props.pulse, archived: false });

    MetabaseAnalytics.trackEvent("PulseUnarchive", "Complete");
  };

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  getConfirmItems() {
    return this.props.pulse.channels.map(
      (c, index) =>
        c.channel_type === "email" ? (
          <span key={index}>
            {jt`This pulse will no longer be emailed to ${(
              <strong>
                {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
                  c.recipients.length,
                )}
              </strong>
            )} ${<strong>{c.schedule_type}</strong>}`}.
          </span>
        ) : c.channel_type === "slack" ? (
          <span key={index}>
            {jt`Slack channel ${(
              <strong>{c.details && c.details.channel}</strong>
            )} will no longer get this pulse ${(
              <strong>{c.schedule_type}</strong>
            )}`}.
          </span>
        ) : (
          <span key={index}>
            {jt`Channel ${(
              <strong>{c.channel_type}</strong>
            )} will no longer receive this pulse ${(
              <strong>{c.schedule_type}</strong>
            )}`}.
          </span>
        ),
    );
  }

  render() {
    const { pulse, formInput } = this.props;
    const isValid = pulseIsValid(pulse, formInput.channels);
    const attachmentsEnabled = emailIsEnabled(pulse);
    return (
      <div className="PulseEdit">
        <div className="PulseEdit-header flex align-center border-bottom py3">
          <h1>{pulse && pulse.id != null ? t`Edit pulse` : t`New pulse`}</h1>
          <ModalWithTrigger
            ref="pulseInfo"
            className="Modal WhatsAPulseModal"
            triggerElement={t`What's a Pulse?`}
            triggerClasses="text-brand text-bold flex-align-right"
          >
            <ModalContent onClose={() => this.refs.pulseInfo.close()}>
              <div className="mx4 mb4">
                <WhatsAPulse
                  button={
                    <button
                      className="Button Button--primary"
                      onClick={() => this.refs.pulseInfo.close()}
                    >{t`Got it`}</button>
                  }
                />
              </div>
            </ModalContent>
          </ModalWithTrigger>
        </div>
        <div className="PulseEdit-content pt2 pb4">
          <PulseEditName {...this.props} setPulse={this.setPulse} />
          <PulseEditCollection {...this.props} setPulse={this.setPulse} />
          <PulseEditCards
            {...this.props}
            setPulse={this.setPulse}
            attachmentsEnabled={attachmentsEnabled}
          />
          <div className="py1 mb4">
            <h2 className="mb3">{t`Where should this data go?`}</h2>
            <PulseEditChannels
              {...this.props}
              setPulse={this.setPulse}
              pulseIsValid={isValid}
            />
          </div>
          <PulseEditSkip {...this.props} setPulse={this.setPulse} />
        </div>
        <div className="PulseEdit-footer flex align-center border-top py3">
          {pulse.archived ? (
            <ActionButton
              key="unarchive"
              actionFn={this.handleUnarchive}
              className={cx("Button Button--danger")}
              normalText={t`Unarchive`}
              activeText={t`Unarchiving…`}
              failedText={t`Unarchive failed`}
              successText={t`Unarchived`}
            />
          ) : (
            <ActionButton
              key="save"
              actionFn={this.handleSave}
              className={cx("Button Button--primary", { disabled: !isValid })}
              normalText={pulse.id != null ? t`Save changes` : t`Create pulse`}
              activeText={t`Saving…`}
              failedText={t`Save failed`}
              successText={t`Saved`}
            />
          )}
          <Button onClick={() => this.props.goBack()} ml={2}>
            {t`Cancel`}
          </Button>
          {pulse.id != null &&
            !pulse.archived && (
              <ModalWithTrigger
                triggerClasses="Button Button--danger flex-align-right flex-no-shrink"
                triggerElement={t`Archive`}
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
            )}
        </div>
      </div>
    );
  }
}
