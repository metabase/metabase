import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import { GenericError } from "metabase/containers/ErrorPages";

export default function LoadingAndGenericErrorWrapper(props) {
  return (
    <LoadingAndErrorWrapper
      {...props}
      renderError={details => <GenericError details={details} />}
    />
  );
}
