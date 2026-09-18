import { type ComponentType, forwardRef } from "react";

export const ExplicitSize =
  () =>
  <P extends object>(ComposedComponent: ComponentType<P>) =>
    forwardRef<unknown, P>(function WrappedComponent(props, ref) {
      return (
        <ComposedComponent ref={ref} width={1000} height={1000} {...props} />
      );
    });
