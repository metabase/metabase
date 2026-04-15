import { GenericError } from "metabase/common/components/ErrorPages";
import {
  LoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";

export function LoadingAndGenericErrorWrapper(
  props: LoadingAndErrorWrapperProps,
) {
  return (
    <LoadingAndErrorWrapper
      {...props}
      renderError={(details) => <GenericError details={details} />}
    />
  );
}
