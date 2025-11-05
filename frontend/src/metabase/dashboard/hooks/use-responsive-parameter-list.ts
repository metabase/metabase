import { useCallback, useEffect, useRef, useState } from "react";

import { useDashboardContext } from "metabase/dashboard/context";
import resizeObserver from "metabase/lib/resize-observer";

type Opts = {
  reservedWidth: number;
  bufferSpace?: number;
};

export function useResponsiveParameterList({
  reservedWidth,
  bufferSpace = 24,
}: Opts) {
  const { isEditing, isEditingParameter } = useDashboardContext();

  const [shouldCollapseList, setShouldCollapseList] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const parameterListRef = useRef<HTMLDivElement>(null);

  const checkForCollision = useCallback(() => {
    if (!containerRef.current || !parameterListRef.current) {
      return false;
    }

    const { width: containerWidth } =
      containerRef.current.getBoundingClientRect();
    const { width: parametersWidth } =
      parameterListRef.current.getBoundingClientRect();

    const requiredWidth = reservedWidth + parametersWidth + bufferSpace;

    return requiredWidth > containerWidth;
  }, [reservedWidth, bufferSpace]);

  useEffect(() => {
    if (isEditingParameter) {
      return;
    }

    const updateCollisionState = () => {
      const shouldCollapse = checkForCollision();
      setShouldCollapseList(shouldCollapse);
    };

    updateCollisionState();

    const element = containerRef.current;
    if (!element) {
      return;
    }

    resizeObserver.subscribe(element, updateCollisionState);
    return () => {
      resizeObserver.unsubscribe(element, updateCollisionState);
    };
  }, [checkForCollision, isEditing, isEditingParameter]);

  return {
    shouldCollapseList,
    containerRef,
    parameterListRef,
  };
}
