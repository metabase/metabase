import { GenericError } from "metabase/components/ErrorPages";
import Loading from "metabase/components/Loading";

export default function LoadingAndGenericErrorWrapper(props) {
  return (
    <Loading
      {...props}
      renderError={details => <GenericError details={details} />}
    />
  );
}
