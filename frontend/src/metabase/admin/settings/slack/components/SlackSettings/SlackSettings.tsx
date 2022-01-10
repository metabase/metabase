import React from "react";
import SlackStatus from "../../containers/SlackStatus";
import SlackSetup from "../../containers/SlackSetup";

export interface SlackSettingsProps {
  hasApp?: boolean;
}

const SlackSettings = ({ hasApp }: SlackSettingsProps): JSX.Element => {
  return hasApp ? <SlackStatus /> : <SlackSetup />;
};

export default SlackSettings;
