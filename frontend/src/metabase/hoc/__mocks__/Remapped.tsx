import type { ComponentType } from "react";

/**
 * @deprecated HOCs are deprecated
 */
const MockRemapped = <P extends object>(
  ComposedComponent: ComponentType<P>,
): ComponentType<P> => ComposedComponent;

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default MockRemapped;
