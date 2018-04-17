import React from "react";
import { t } from "c-3po";

import ErrorMessage from "metabase/components/ErrorMessage.jsx";

const GenericError = ({
  title = t`Something's gone wrong`,
  message = t`We've run into an error. You can try refreshing the page, or just go back.`,
}) => (
  <div className="flex flex-column layout-centered full-height">
    <ErrorMessage type="serverError" title={title} message={message} />
  </div>
);

export default GenericError;
