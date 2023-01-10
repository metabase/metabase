import React from "react";
import { SlackSettings } from "metabase-types/api";
import SlackForm from "../SlackForm";

export interface SlackStatusFormProps {
  settings: SlackSettings;
}

const SlackStatusForm = ({ settings }: SlackStatusFormProps): JSX.Element => {
  return <SlackForm initialValues={settings} isReadOnly />;
};

export default SlackStatusForm;
