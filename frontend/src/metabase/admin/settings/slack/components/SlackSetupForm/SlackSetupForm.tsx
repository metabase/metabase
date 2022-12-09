import React from "react";
import { SlackSettings } from "metabase-types/api";
import SlackForm from "../SlackForm";

const DEFAULT_SETTINGS: SlackSettings = {
  "slack-app-token": "",
  "slack-files-channel": "",
};

export interface SlackSetupFormProps {
  onSubmit: (settings: SlackSettings) => void;
}

const SlackSetupForm = ({ onSubmit }: SlackSetupFormProps): JSX.Element => {
  return <SlackForm initialValues={DEFAULT_SETTINGS} onSubmit={onSubmit} />;
};

export default SlackSetupForm;
