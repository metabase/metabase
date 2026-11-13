import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import type { SdkComponentName } from "embedding-sdk-bundle/analytics/component-events";

import { SdkComponentPerformance } from "./event";

const SdkComponentPerformanceContext =
  createContext<SdkComponentPerformance | null>(null);

/** Measures the public component inside it. Only the first one that mounts can send the event. */
export function SdkComponentPerformanceBoundary({
  sdkComponentName,
  children,
}: {
  sdkComponentName: SdkComponentName;
  children: ReactNode;
}) {
  const [componentPerformance] = useState(
    () => new SdkComponentPerformance(sdkComponentName),
  );

  useEffect(() => {
    componentPerformance.mount();
    return () => componentPerformance.unmount();
  }, [componentPerformance]);

  return (
    <SdkComponentPerformanceContext.Provider value={componentPerformance}>
      {children}
    </SdkComponentPerformanceContext.Provider>
  );
}

/** Records `first_component_render` at its first render. */
export function SdkComponentPerformanceFirstRender({
  children,
}: {
  children: ReactNode;
}) {
  // Not in an effect: the effects of the children run first, and they start the requests
  useSdkComponentPerformance()?.recordMark("first_component_render");

  return children;
}

export function useSdkComponentPerformance(): SdkComponentPerformance | null {
  return useContext(SdkComponentPerformanceContext);
}
