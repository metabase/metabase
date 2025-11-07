import { useMemo } from "react";
import { useLocation } from "react-use";

export type TransformsNavTab = "transforms" | "jobs" | "runs";

export function useTransformsCurrentTab(): TransformsNavTab {
  const location = useLocation();

  return useMemo(() => {
    const pathname = location.pathname ?? "";
    const pathSegments = pathname.split("/").filter(Boolean);
    const transformsIndex = pathSegments.indexOf("transforms");

    if (transformsIndex === -1 || transformsIndex >= pathSegments.length - 1) {
      return "transforms";
    }

    const nextSegment = pathSegments[transformsIndex + 1];

    if (nextSegment === "jobs" || nextSegment === "runs") {
      return nextSegment;
    }

    return "transforms";
  }, [location.pathname]);
}
