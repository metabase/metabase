/* eslint-disable react/prop-types */
import { createRef, Component } from "react";
import PropTypes from "prop-types";
import { t, jt, ngettext, msgid } from "ttag";

import cx from "classnames";
import ActionButton from "metabase/components/ActionButton";

import Button from "metabase/core/components/Button";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import { Icon } from "metabase/core/components/Icon";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import ModalWithTrigger from "metabase/components/ModalWithTrigger";
import ModalContent from "metabase/components/ModalContent";
import Subhead from "metabase/components/type/Subhead";
import Text from "metabase/components/type/Text";

import { color } from "metabase/lib/colors";
import MetabaseSettings from "metabase/lib/settings";
import { pulseIsValid, cleanPulse, emailIsEnabled } from "metabase/lib/pulse";
import * as Urls from "metabase/lib/urls";

import Collections from "metabase/entities/collections";
import WhatsAPulse from "./WhatsAPulse";
import PulseEditSkip from "./PulseEditSkip";
import PulseEditChannels from "./PulseEditChannels";
import PulseEditCards from "./PulseEditCards";
import PulseEditCollection from "./PulseEditCollection";
import PulseEditName from "./PulseEditName";

import { PulseHeader, PulseHeaderContent } from "./PulseEdit.styled";

class PulseEdit extends Component {
  static propTypes = {
    pulse: PropTypes.object.isRequired,
    pulseId: PropTypes.number,
    formInput: PropTypes.object.isRequired,
    setEditingPulse: PropTypes.func.isRequired,
    fetchPulseFormInput: PropTypes.func.isRequired,
    updateEditingPulse: PropTypes.func.isRequired,
    saveEditingPulse: PropTypes.func.isRequired,
    onChangeLocation: PropTypes.func.isRequired,
    goBack: PropTypes.func,
    initialCollectionId: PropTypes.number,
  };

  constructor(props) {
    super(props);

    this.pulseInfo = createRef();
  }

  componentDidMount() {
    this.props.setEditingPulse(
      this.props.pulseId,
      this.props.initialCollectionId,
    );
    this.props.fetchPulseFormInput();

    MetabaseAnalytics.trackStructEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Start",
    );
  }

  handleSave = async () => {
    const pulse = cleanPulse(this.props.pulse, this.props.formInput.channels);
    await this.props.updateEditingPulse(pulse);
    await this.props.saveEditingPulse();

    MetabaseAnalytics.trackStructEvent(
      this.props.pulseId ? "PulseEdit" : "PulseCreate",
      "Complete",
      this.props.pulse.cards.length,
    );

    const collection = this.props.collection
      ? this.props.collection
      : { id: pulse.collection_id };
    this.props.onChangeLocation(Urls.collection(collection));
  };

  handleArchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, true);

    MetabaseAnalytics.trackStructEvent("PulseArchive", "Complete");

    this.props.onChangeLocation(Urls.collection(this.props.collection));
  };

  handleUnarchive = async () => {
    await this.props.setPulseArchived(this.props.pulse, false);
    this.setPulse({ ...this.props.pulse, archived: false });

    MetabaseAnalytics.trackStructEvent("PulseUnarchive", "Complete");
  };

  setPulse = pulse => {
    this.props.updateEditingPulse(pulse);
  };

  getConfirmItems() {
    return this.props.pulse.channels.map((c, index) =>
      c.channel_type === "email" ? (
        <span key={index}>
          {jt`This pulse will no longer be emailed to ${(
            <strong>
              {(n => ngettext(msgid`${n} address`, `${n} addresses`, n))(
                c.recipients.length,
              )}
            </strong>
          )} ${(<strong>{c.schedule_type}</strong>)}`}
          .
        </span>
      ) : c.channel_type === "slack" ? (
        <span key={index}>
          {jt`Slack channel ${(
            <strong>{c.details && c.details.channel}</strong>
          )} will no longer get this pulse ${(
            <strong>{c.schedule_type}</strong>
          )}`}
          .
        </span>
      ) : (
        <span key={index}>
          {jt`Channel ${(
            <strong>{c.channel_type}</strong>
          )} will no longer receive this pulse ${(
            <strong>{c.schedule_type}</strong>
          )}`}
          .
        </span>
      ),
    );
  }

  render() {
    const { pulse, formInput } = this.props;
    const isValid = pulseIsValid(pulse, formInput.channels);
    const attachmentsEnabled = emailIsEnabled(pulse);
    const link = (
      <a
        className="link"
        href={MetabaseSettings.docsUrl("dashboards/subscriptions")}
      >{t`dashboard subscriptions`}</a>
    );
    return (
      <div className="PulseEdit">
        <div className="PulseEdit-header flex align-center border-bottom py3">
          <h1>{pulse && pulse.id != null ? t`Edit pulse` : t`New pulse`}</h1>
          <ModalWithTrigger
            ref={this.pulseInfo}
            className="Modal WhatsAPulseModal"
            triggerElement={t`What's a Pulse?`}
            triggerClasses="text-brand text-bold flex-align-right"
          >
            <ModalContent onClose={() => this.pulseInfo.current.close()}>
              <div className="mx4 mb4">
                <WhatsAPulse
                  button={
                    <button
                      className="Button Button--primary"
                      onClick={() => this.pulseInfo.current.close()}
                    >{t`Got it`}</button>
                  }
                />
              </div>
            </ModalContent>
          </ModalWithTrigger>
        </div>
        <div className="PulseEdit-content pt2 pb4">
          <PulseHeader className="hover-parent hover--visibility">
            <Icon
              name="warning"
              color={color("warning")}
              size={24}
              className="mr1"
            />
            <PulseHeaderContent>
              <Subhead>{t`Pulses are being phased out`}</Subhead>
              <Text>{jt`You can now set up ${link} instead. We'll remove Pulses in a future release, and help you migrate any that you still have.`}</Text>
            </PulseHeaderContent>
          </PulseHeader>

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
              invalidRecipientText={domains =>
                t`You're only allowed to email pulses to addresses ending in ${domains}`
              }
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
          <Button onClick={() => this.props.goBack()} className="ml2">
            {t`Cancel`}
          </Button>
          {pulse.id != null && !pulse.archived && (
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

export default Collections.load({
  id: (state, { pulse, initialCollectionId }) =>
    pulse.collection_id || initialCollectionId,
  loadingAndErrorWrapper: false,
})(PulseEdit);
