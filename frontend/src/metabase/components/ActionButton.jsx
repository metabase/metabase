/* @flow */

import React, { Component } from "react";
import PropTypes from "prop-types";

import Icon from "metabase/components/Icon";
import Button from "metabase/components/Button";

import { cancelable } from "metabase/lib/promise";
import { t } from "ttag";
import cx from "classnames";

type Props = {
  actionFn: (...args: any[]) => Promise<any>,
  className?: string,
  children?: any,
  normalText?: string,
  activeText?: string,
  failedText?: string,
  successText?: string,
  forceActiveStyle?: boolean,
};

type State = {
  active: boolean,
  result: null | "success" | "failed",
};

export default class ActionButton extends Component {
  props: Props;
  state: State;

  timeout: ?any;
  actionPromise: ?{ cancel: () => void };

  constructor(props: Props) {
    super(props);

    this.state = {
      active: false,
      result: null,
    };
  }

  static propTypes = {
    actionFn: PropTypes.func.isRequired,
  };

  static defaultProps = {
    className: "Button",
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

  onClick = (event: MouseEvent) => {
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
      normalText,
      activeText,
      failedText,
      successText,
      // eslint-disable-next-line no-unused-vars
      actionFn,
      className,
      forceActiveStyle,
      children,
      ...props
    } = this.props;
    const { active, result } = this.state;

    return (
      <Button
        {...props}
        className={
          forceActiveStyle
            ? cx("Button", "Button--waiting")
            : cx(className, {
                "Button--waiting pointer-events-none": active,
                "Button--success pointer-events-none": result === "success",
                "Button--danger": result === "failed",
              })
        }
        onClick={this.onClick}
      >
        {active ? (
          // TODO: loading spinner
          activeText
        ) : result === "success" ? (
          <span>
            {forceActiveStyle ? null : <Icon name="check" size={12} />}
            <span className="ml1">{successText}</span>
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
