import React from "react";

import { GenericError } from "metabase/containers/ErrorPages";

import LoadingAndErrorWrapper from "./LoadingAndErrorWrapper";

export default function LoadingAndGenericErrorWrapper(props) {
  return (
    <LoadingAndErrorWrapper
      {...props}
      renderError={details => <GenericError details={details} />}
    />
  );
}
