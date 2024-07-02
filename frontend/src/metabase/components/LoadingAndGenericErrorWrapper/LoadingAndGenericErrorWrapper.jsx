import { GenericError } from "metabase/components/ErrorPages";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";

export default function LoadingAndGenericErrorWrapper(props) {
  return (
    <LoadingAndErrorWrapper
      {...props}
      renderError={details => <GenericError details={details} />}
    />
  );
}
