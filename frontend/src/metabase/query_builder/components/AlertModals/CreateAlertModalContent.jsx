/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { createAlert } from "metabase/alert/alert";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ChannelSetupModal from "metabase/components/ChannelSetupModal";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import MetabaseCookies from "metabase/lib/cookies";
import { fetchPulseFormInput } from "metabase/pulse/actions";
import {
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
import { getDefaultAlert } from "metabase-lib/v1/Alert";

import { AlertEditForm } from "./AlertEditForm";
import { AlertEducationalScreen } from "./AlertEducationalScreen";
import { AlertModalTitle } from "./AlertModalTitle";
import { AlertModalFooter } from "./AlertModals.styled";

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
