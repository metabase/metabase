import { type ComponentType, forwardRef } from "react";

import { getMockExplicitSize } from "../tests/mock-size";

export const ExplicitSize =
  () =>
  <P extends object>(ComposedComponent: ComponentType<P>) =>
    forwardRef<unknown, P>(function WrappedComponent(props, ref) {
      const { width, height } = getMockExplicitSize();
      return (
        <ComposedComponent ref={ref} width={width} height={height} {...props} />
      );
    });
