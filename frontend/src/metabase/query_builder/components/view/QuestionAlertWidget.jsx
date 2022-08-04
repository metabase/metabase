/* eslint-disable react/prop-types */
import React from "react";
import { t } from "ttag";
import Popover from "metabase/components/Popover";
import AlertListPopoverContent from "../AlertListPopoverContent";
import { CreateAlertIcon, ViewAlertIcon } from "./QuestionAlertWidget.styled";

export default class QuestionAlertWidget extends React.Component {
  state = {
    isOpen: false,
    // this isFrozen nonsense is due to AlertListPopoverContent containing a <Modal>
    isFrozen: false,
  };
  close = () => {
    this.setState({ isOpen: false, isFrozen: false });
  };
  open = () => {
    this.setState({ isOpen: true, isFrozen: false });
  };
  freeze = () => {
    this.setState({ isFrozen: true });
  };

  render() {
    const {
      question,
      questionAlerts,
      onCreateAlert,
      className,
      canManageSubscriptions,
    } = this.props;
    const { isOpen, isFrozen } = this.state;

    if (!canManageSubscriptions) {
      return null;
    }

    if (question.isSaved() && Object.values(questionAlerts).length > 0) {
      return (
        <span onClick={this.open}>
          <ViewAlertIcon name="bell" className={className} />
          <Popover
            isOpen={isOpen}
            className={isFrozen ? "hide" : null}
            onClose={this.close}
          >
            <AlertListPopoverContent
              setMenuFreeze={this.freeze}
              closeMenu={this.close}
            />
          </Popover>
        </span>
      );
    } else {
      return (
        <CreateAlertIcon
          name="bell"
          tooltip={t`Get alerts`}
          className={className}
          onClick={onCreateAlert}
        />
      );
    }
  }
}

QuestionAlertWidget.shouldRender = ({ question, visualizationSettings }) =>
  question.alertType(visualizationSettings) !== null;
