import { type ComponentType, type ReactNode, Suspense, lazy } from "react";

import { Center, Loader } from "metabase/ui";

function DefaultFallback() {
  return (
    <Center h="100%">
      <Loader />
    </Center>
  );
}

/**
 * Creates a lazily-loaded component for use in react-router v3 `component` prop.
 * Wraps React.lazy with Suspense so the Route doesn't need to know about loading states.
 */
export function lazyComponent<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T } | { [key: string]: T }>,
  exportName?: string,
  fallback?: ReactNode,
): ComponentType<any> {
  const LazyComp = lazy(() =>
    factory().then((mod) => {
      if (exportName && exportName in mod) {
        return { default: (mod as any)[exportName] };
      }
      return mod as { default: T };
    }),
  );

  function LazyWrapper(props: any) {
    return (
      <Suspense fallback={fallback ?? <DefaultFallback />}>
        <LazyComp {...props} />
      </Suspense>
    );
  }

  LazyWrapper.displayName = `Lazy(${exportName ?? "default"})`;

  return LazyWrapper;
}
