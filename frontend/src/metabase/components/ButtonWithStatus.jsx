import React, { Component } from "react";
import { t } from "c-3po";

import Button from "metabase/components/Button";

let defaultTitleForState = {
  default: t`Save`,
  inProgress: t`Saving...`,
  completed: t`Saved!`,
  failed: t`Saving failed.`,
};

// TODO: Tom Robinson 4/16/2018: Is this the same functionality as ActionButton?

/**
 * Renders a button that triggers a promise-returning `onClickOperation` when user clicks the button.
 * When the button is clicked, `inProgress` text is shown, and when the promise resolves, `completed` text is shown.
 */
export default class ButtonWithStatus extends Component {
  props: {
    onClickOperation: any => Promise<void>,
    titleForState?: string[],
    disabled?: boolean,
    className?: string,
  };

  state = {
    progressState: "default",
  };

  onClick = async () => {
    this.setState({ progressState: "inProgress" });
    try {
      await this.props.onClickOperation();
      this.setState({ progressState: "completed" });
    } catch (e) {
      console.warn(
        "The operation triggered by click in `ButtonWithStatus` failed",
      );
      this.setState({ progressState: "failed" });
      throw e;
    } finally {
      setTimeout(() => this.setState({ progressState: "default" }), 3000);
    }
  };

  render() {
    const { progressState } = this.state;
    const titleForState = {
      ...defaultTitleForState,
      ...(this.props.titleForState || {}),
    };
    const title = titleForState[progressState];
    const disabled = this.props.disabled || progressState !== "default";

    return (
      <Button
        className={this.props.className}
        primary={!disabled}
        success={progressState === "completed"}
        disabled={disabled}
        onClick={this.onClick}
      >
        {title}
      </Button>
    );
  }
}
