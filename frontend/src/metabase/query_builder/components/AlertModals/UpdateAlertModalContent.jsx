/* eslint-disable react/prop-types */
import cx from "classnames";
import { Component } from "react";
import { connect } from "react-redux";
import { t } from "ttag";

import { deleteAlert, updateAlert } from "metabase/alert/alert";
import ButtonWithStatus from "metabase/components/ButtonWithStatus";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import CS from "metabase/css/core/index.css";
import { alertIsValid } from "metabase/lib/alert";
import * as MetabaseAnalytics from "metabase/lib/analytics";
import { updateUrl } from "metabase/query_builder/actions";
import {
  getQuestion,
  getVisualizationSettings,
} from "metabase/query_builder/selectors";
import { getUser, getUserIsAdmin } from "metabase/selectors/user";

import { AlertEditForm } from "./AlertEditForm";
import { AlertModalTitle } from "./AlertModalTitle";
import { AlertModalFooter } from "./AlertModals.styled";
import { DeleteAlertSection } from "./DeleteAlertSection";

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
