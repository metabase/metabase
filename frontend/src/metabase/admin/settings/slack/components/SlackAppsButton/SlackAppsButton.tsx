import React from "react";
import { ButtonIcon, ButtonRoot, ButtonText } from "./SlackAppsButton.styled";

const SlackAppsButton = (): JSX.Element => {
  return (
    <ButtonRoot
      className="Button Button--primary"
      href="https://api.slack.com/apps"
    >
      <ButtonText>{`Open Slack Apps`}</ButtonText>
      <ButtonIcon name="external" />
    </ButtonRoot>
  );
};

export default SlackAppsButton;
