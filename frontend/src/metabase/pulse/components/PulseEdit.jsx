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
import Link from "metabase/components/Link";
import MetabaseAnalytics from "metabase/lib/analytics";
import ModalWithTrigger from "metabase/components/ModalWithTrigger.jsx";
import ModalContent from "metabase/components/ModalContent.jsx";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm.jsx";

import { pulseIsValid, cleanPulse, emailIsEnabled } from "metabase/lib/pulse";
import * as Urls from "metabase/lib/urls";

import _ from "underscore";
import cx from "classnames";

@withRouter
export default class PulseEdit extends Component {
  constructor(props) {
    super(props);

    _.bindAll(this, "save", "delete", "setPulse");
  }

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
    location: PropTypes.object,
  };

  componentDidMount() {
    this.props.setEditingPulse(this.props.pulseId);
    this.props.fetchCards();
    this.props.fetchUsers();
    this.props.fetchPulseFormInput();

    MetabaseAnalytics.trackEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Start",
    );
  }

  async save() {
    let pulse = cleanPulse(this.props.pulse, this.props.formInput.channels);
    await this.props.updateEditingPulse(pulse);
    await this.props.saveEditingPulse();

    MetabaseAnalytics.trackEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Complete",
      this.props.pulse.cards.length,
    );

    this.props.onChangeLocation(Urls.collection(pulse.collection_id));
  }

  async delete() {
    await this.props.deletePulse(this.props.pulse.id);

    MetabaseAnalytics.trackEvent("PulseDelete", "Complete");

    this.props.onChangeLocation("/pulse");
  }

  setPulse(pulse) {
    this.props.updateEditingPulse(pulse);
  }

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
    const { pulse, formInput, location } = this.props;
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
          <PulseEditCollection
            {...this.props}
            setPulse={this.setPulse}
            initialCollectionId={location.query.collectionId}
          />
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
          {pulse &&
            pulse.id != null && (
              <div className="DangerZone mb2 p3 rounded bordered relative">
                <h3
                  className="text-error absolute top bg-white px1"
                  style={{ marginTop: "-12px" }}
                >{t`Danger Zone`}</h3>
                <div className="ml1">
                  <h4 className="text-bold mb1">{t`Delete this pulse`}</h4>
                  <div className="flex">
                    <p className="h4 pr2">{t`Stop delivery and delete this pulse. There's no undo, so be careful.`}</p>
                    <ModalWithTrigger
                      ref={"deleteModal" + pulse.id}
                      triggerClasses="Button Button--danger flex-align-right flex-no-shrink"
                      triggerElement={t`Delete this Pulse`}
                    >
                      <DeleteModalWithConfirm
                        objectType="pulse"
                        title={t`Delete` + ' "' + pulse.name + '"?'}
                        confirmItems={this.getConfirmItems()}
                        onClose={() =>
                          this.refs["deleteModal" + pulse.id].close()
                        }
                        onDelete={this.delete}
                      />
                    </ModalWithTrigger>
                  </div>
                </div>
              </div>
            )}
        </div>
        <div className="PulseEdit-footer flex align-center border-top py3">
          <ActionButton
            actionFn={this.save}
            className={cx("Button Button--primary", { disabled: !isValid })}
            normalText={pulse.id != null ? t`Save changes` : t`Create pulse`}
            activeText={t`Saving…`}
            failedText={t`Save failed`}
            successText={t`Saved`}
          />
          <Link
            to={Urls.collection(location.query.collectionId)}
            className="Button ml2"
          >{t`Cancel`}</Link>
        </div>
      </div>
    );
  }
}
