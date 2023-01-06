import { useCallback, useEffect, useRef } from "react";

const useMountedState = (): (() => boolean) => {
  const isMountedRef = useRef<boolean>(false);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return useCallback(() => {
    return isMountedRef.current;
  }, []);
};

export default useMountedState;
