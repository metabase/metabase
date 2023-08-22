/* eslint-disable react/prop-types */
import { createRef, Component } from "react";

import cx from "classnames";
import { t } from "ttag";

import { Icon } from "metabase/core/components/Icon";
import Popover from "metabase/components/Popover";

import AlertListPopoverContent from "../AlertListPopoverContent";
import { AlertIcon } from "./QuestionAlertWidget.styled";

export default class QuestionAlertWidget extends Component {
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

  constructor(props, context) {
    super(props, context);

    this.rootRef = createRef();
  }

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
        <span onClick={this.open} ref={this.rootRef}>
          <Icon
            name="bell"
            className={cx(className, "text-brand cursor-pointer")}
          />
          <Popover
            target={this.rootRef.current}
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
        <AlertIcon
          name="bell"
          tooltip={t`Get alerts`}
          size={20}
          className={className}
          onClick={onCreateAlert}
        />
      );
    }
  }
}

QuestionAlertWidget.shouldRender = ({ question, visualizationSettings }) =>
  question.alertType(visualizationSettings) !== null;
