/* eslint-disable react/prop-types */
import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";
import { t } from "ttag";

import Button from "metabase/core/components/Button";
import ButtonsS from "metabase/css/components/buttons.module.css";
import CS from "metabase/css/core/index.css";
import { cancelable } from "metabase/lib/promise";
import { Icon } from "metabase/ui";

import { SmallSpinner } from "./ActionButton.styled";

export default class ActionButton extends Component {
  constructor(props) {
    super(props);

    this.state = {
      active: false,
      result: null,
    };
    this.resetState.bind(this);
  }

  static propTypes = {
    actionFn: PropTypes.func.isRequired,
  };

  static defaultProps = {
    className: ButtonsS.Button,
    successClassName: ButtonsS.ButtonSuccess,
    failedClassName: ButtonsS.ButtonDanger,
    normalText: t`Save`,
    activeText: t`Saving...`,
    failedText: t`Save failed`,
    successText: t`Saved`,
    forceActiveStyle: false,
  };

  componentWillUnmount() {
    clearTimeout(this.timeout);
    if (this.actionPromise) {
      this.actionPromise.cancel();
    }
  }

  resetState() {
    clearTimeout(this.timeout);
    this.setState({
      active: false,
      result: null,
    });
  }

  resetStateOnTimeout = () => {
    // clear any previously set timeouts then start a new one
    clearTimeout(this.timeout);
    this.timeout = setTimeout(
      () =>
        this.setState({
          active: false,
          result: null,
        }),
      5000,
    );
  };

  onClick = event => {
    event.preventDefault();

    // set state to active
    this.setState({
      active: true,
      result: null,
    });

    // run the function we want bound to this button
    this.actionPromise = cancelable(this.props.actionFn());
    this.actionPromise.then(
      success => {
        this.setState(
          {
            active: false,
            result: "success",
          },
          this.resetStateOnTimeout,
        );
      },
      error => {
        if (!error.isCanceled) {
          console.error(error);
          this.setState(
            {
              active: false,
              result: "failed",
            },
            this.resetStateOnTimeout,
          );
        }
      },
    );
  };

  render() {
    const {
      innerRef,
      normalText,
      activeText,
      failedText,
      successText,
      useLoadingSpinner = false,
      resetState,
      actionFn,
      className,
      successClassName,
      failedClassName,
      forceActiveStyle,
      children,
      ...props
    } = this.props;
    const { active, result } = this.state;
    const isActionDisabled = active || result === "success";

    return (
      <Button
        ref={innerRef}
        {...props}
        className={
          forceActiveStyle
            ? ButtonsS.Button
            : cx(className, {
                [successClassName]: result === "success",
                [failedClassName]: result === "failed",
                [CS.pointerEventsNone]: isActionDisabled,
              })
        }
        onClick={this.onClick}
      >
        {active ? (
          useLoadingSpinner ? (
            <SmallSpinner />
          ) : (
            activeText
          )
        ) : result === "success" ? (
          <span>
            {forceActiveStyle ? null : <Icon name="check" size={12} />}
            <span className={CS.ml1}>{successText}</span>
          </span>
        ) : result === "failed" ? (
          failedText
        ) : (
          children || normalText
        )}
      </Button>
    );
  }
}
