import React from "react";
import { t } from "c-3po";
import { Flex } from "grid-styled";
import fitViewport from "metabase/hoc/FitViewPort";

import ErrorMessage from "metabase/components/ErrorMessage";
import ErrorDetails from "metabase/components/ErrorDetails";

const GenericError = ({
  title = t`Something's gone wrong`,
  message = t`We've run into an error. You can try refreshing the page, or just go back.`,
  details = null,
}) => (
  <Flex align="center" justify="center" className="full-height">
    <ErrorMessage type="serverError" title={title} message={message} />
    <ErrorDetails className="pt2" details={details} centered />
  </Flex>
);

export default fitViewport(GenericError);
