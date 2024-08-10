import LoadingAndErrorWrapper, {
  type LoadingAndErrorWrapperProps,
} from "./LoadingAndErrorWrapper";

export const DelayedLoadingAndErrorWrapper = ({
  children,
  ...props
}: LoadingAndErrorWrapperProps) => {
  return (
    <LoadingAndErrorWrapper delay {...props}>
      {children}
    </LoadingAndErrorWrapper>
  );
};
