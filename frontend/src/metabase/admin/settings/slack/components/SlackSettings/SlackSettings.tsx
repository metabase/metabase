import React from "react";
import SlackStatus from "../../containers/SlackStatus";
import SlackSetup from "../../containers/SlackSetup";

export interface SlackSettingsProps {
  isApp?: boolean;
}

const SlackSettings = ({ isApp }: SlackSettingsProps): JSX.Element => {
  return isApp ? <SlackStatus /> : <SlackSetup />;
};

export default SlackSettings;
