import React from "react";

import cx from "classnames";
import { t } from "ttag";

import Icon from "metabase/components/Icon";
import Popover from "metabase/components/Popover";

import AlertListPopoverContent from "../AlertListPopoverContent";

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
    const { question, questionAlerts, onCreateAlert, className } = this.props;
    const { isOpen, isFrozen } = this.state;
    if (question.isSaved() && Object.values(questionAlerts).length > 0) {
      return (
        <span onClick={this.open}>
          <Icon
            name="bell"
            className={cx(className, "text-brand cursor-pointer")}
          />
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
        <Icon
          name="bell"
          tooltip={t`Get alerts`}
          className={cx(className, "text-brand-hover cursor-pointer")}
          onClick={onCreateAlert}
        />
      );
    }
  }
}

QuestionAlertWidget.shouldRender = ({ question, visualizationSettings }) =>
  question.alertType(visualizationSettings) !== null;
