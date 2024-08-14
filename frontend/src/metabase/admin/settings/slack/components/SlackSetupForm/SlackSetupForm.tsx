import type { SlackSettings } from "metabase-types/api";

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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackSetupForm;
