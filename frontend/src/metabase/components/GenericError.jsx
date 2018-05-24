import React from "react";
import { t } from "c-3po";

import ErrorMessage from "metabase/components/ErrorMessage";
import ErrorDetails from "metabase/components/ErrorDetails";

const GenericError = ({
  title = t`Something's gone wrong`,
  message = t`We've run into an error. You can try refreshing the page, or just go back.`,
  details = null,
}) => (
  <div className="flex flex-column layout-centered full-height">
    <ErrorMessage type="serverError" title={title} message={message} />
    <ErrorDetails className="pt2" details={details} centered />
  </div>
);

export default GenericError;
