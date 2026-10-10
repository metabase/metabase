import {
  LoadingAndErrorWrapper as BaseLoadingAndErrorWrapper,
  type LoadingAndErrorWrapperProps as BaseLoadingAndErrorWrapperProps,
} from "metabase/common/components/LoadingAndErrorWrapper";
import { Flex } from "metabase/ui";

// Rendered as a leaf, and the base wrapper's render-function children would not fit Flex anyway
type LoadingAndErrorWrapperProps = Omit<
  BaseLoadingAndErrorWrapperProps,
  "children"
>;

const LoadingAndErrorWrapper = (props: LoadingAndErrorWrapperProps) => (
  <Flex
    component={BaseLoadingAndErrorWrapper}
    direction="column"
    mih="36rem"
    {...props}
  />
);

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default LoadingAndErrorWrapper;
