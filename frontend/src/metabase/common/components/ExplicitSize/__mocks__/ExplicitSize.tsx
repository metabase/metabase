import { forwardRef } from "react";

export const ExplicitSize = () => (ComposedComponent: any) => {
  const WrappedComponent = forwardRef((props: any, ref) => (
    <ComposedComponent ref={ref} width={1000} height={1000} {...props} />
  ));

  return WrappedComponent;
};
