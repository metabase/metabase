import React from "react";
import SlackStatus from "../../containers/SlackStatus";
import SlackSetup from "../../containers/SlackSetup";

export interface SlackSettingsProps {
  hasSlackApp: boolean;
}

const SlackSettings = ({ hasSlackApp }: SlackSettingsProps): JSX.Element => {
  return hasSlackApp ? <SlackStatus /> : <SlackSetup />;
};

export default SlackSettings;
