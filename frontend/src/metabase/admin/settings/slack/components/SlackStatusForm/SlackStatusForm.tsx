import type { SlackSettings } from "metabase-types/api";

import SlackForm from "../SlackForm";

export interface SlackStatusFormProps {
  settings: SlackSettings;
}

const SlackStatusForm = ({ settings }: SlackStatusFormProps): JSX.Element => {
  return <SlackForm initialValues={settings} isReadOnly />;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SlackStatusForm;
