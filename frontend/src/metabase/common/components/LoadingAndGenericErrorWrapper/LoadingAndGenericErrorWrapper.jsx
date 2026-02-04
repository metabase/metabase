import { GenericError } from "metabase/common/components/ErrorPages";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

export function LoadingAndGenericErrorWrapper(props) {
  return (
    <LoadingAndErrorWrapper
      {...props}
      renderError={(details) => <GenericError details={details} />}
    />
  );
}
